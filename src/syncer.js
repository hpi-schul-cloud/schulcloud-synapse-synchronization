const {Configuration} = require('@schul-cloud/commons');
const matrix_admin_api = require('./matrixApi');

const MATRIX_SERVERNAME = Configuration.get('MATRIX_SERVERNAME');

const EVENT_DEFAULT_ALL = 0;
const EVENT_DEFAULT_MOD_ONLY = 50;
const POWER_LEVEL_USER = 0;
const POWER_LEVEL_MOD = 50;
const POWER_LEVEL_ADMIN = 100;

module.exports = {
  syncUserWithMatrix,

  getOrCreateUser,
  createUser,
  syncRoom,
  syncRoomMember,
};


// PUBLIC FUNCTIONS
async function syncUserWithMatrix(payload) {
  const user_id = payload.user.id;
  const userFoundOrCreated = await getOrCreateUser(payload.user);

  if (userFoundOrCreated === 'created' && payload.welcome) {
    // create private room
    const alias = `sync_${user_id.slice(5, 29)}`;
    const room_state = await syncRoom(alias, '', '', true, EVENT_DEFAULT_ALL);
    await syncRoomMember(room_state, user_id, POWER_LEVEL_MOD);

    // send welcome message
    await sendWelcomeMessage(room_state[0].room_id, payload.user, payload.welcome);
  }

  if (payload.rooms) {
    await asyncForEach(payload.rooms, async (room) => {
      const alias = `${room.type}_${room.id}`;
      const topic = room.description || (room.type === 'team' && 'Team') || (room.type === 'course' && 'Kurs') || `Kanal für ${room.name} (${payload.school.name})`;
      const events_default = room.bidirectional ? EVENT_DEFAULT_ALL : EVENT_DEFAULT_MOD_ONLY;
      const room_state = await syncRoom(alias, room.name, topic, false, events_default);

      const user_power_level = payload.user.is_school_teacher ? POWER_LEVEL_MOD : POWER_LEVEL_USER;
      await syncRoomMember(room_state, user_id, user_power_level);
    });
  }

  // always join user (previous check can be implemented later)
  if (payload.school.has_allhands_channel) {
    const room_name = 'Ankündigungen';
    const topic = `${payload.school.name}`;
    const alias = `news_${payload.school.id}`;
    const room_state = await syncRoom(alias, room_name, topic, false, EVENT_DEFAULT_MOD_ONLY);

    const user_power_level = payload.user.is_school_admin ? POWER_LEVEL_ADMIN : POWER_LEVEL_USER;
    await syncRoomMember(room_state, user_id, user_power_level);
  } else {
    // TODO: delete or block room if setting is changed
  }

  // Lehrerzimmer
  if (payload.user.is_school_teacher === true) {
    const room_name = 'Lehrerzimmer';
    const topic = `${payload.school.name}`;
    const alias = `teachers_${payload.school.id}`;
    const room_state = await syncRoom(alias, room_name, topic, false, EVENT_DEFAULT_ALL);

    const user_power_level = payload.user.is_school_admin ? POWER_LEVEL_MOD : POWER_LEVEL_USER;
    await syncRoomMember(room_state, user_id, user_power_level);
  }
}

// INTERNAL FUNCTIONS
async function sendWelcomeMessage(room_id, user, welcome) {
  const message = {
    msgtype: 'm.text',
    body: welcome.text,
  };
  return sendMessage(room_id, message);
}

async function sendMessage(room_id, message) {
  return matrix_admin_api
    .post(`/_matrix/client/r0/rooms/${room_id}/send/m.room.message`, message)
    .then(() => {
      console.log('Message sent.');
    })
    .catch(logRequestError);
}

async function getOrCreateUser(user) {
  // check if user exists
  // Docu: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst#query-account
  return matrix_admin_api
    .get(`/_synapse/admin/v2/users/${user.id}`)
    .then(() => {
      console.log(`user ${user.id} found.`);
      return 'found';
    })
    .catch(() => {
      console.log(`user ${user.id} not there yet.`);
      return createUser(user);
    });
}

async function createUser(user) {
  // Docu: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst#create-or-modify-account
  const newUser = {
    password: Math.random().toString(36), // we will never use this, password login should be disabled
    displayname: user.name,
    threepids: [],
    admin: false,
    deactivated: false,
  };
  if (user.email) {
    newUser.threepids.push({
      medium: 'email',
      address: user.email,
    });
  }

  return matrix_admin_api
    .put(`/_synapse/admin/v2/users/${user.id}`, newUser)
    .then(() => {
      console.log(`user ${user.id} created.`);
      return 'created';
    })
    .catch(logRequestError);
}

async function syncRoomMember(room_state, user_id, user_power_level) {
  // is member?
  const state_member = room_state.find((state) => (state.type === 'm.room.member' && state.user_id === user_id));
  if (!state_member || state_member.content.membership === 'leave') {
    await inviteUserToRoom(user_id, room_state[0].room_id);
    await joinUserToRoom(user_id, room_state[0].room_id);
  }

  // is power level right?
  const currentUserPowerLevel = getUserPowerLevel(room_state, user_id);
  if (currentUserPowerLevel !== user_power_level) {
    await setUserPowerLevel(room_state, user_id, user_power_level);
  }
}

async function inviteUserToRoom(user_id, room_id) {
  return matrix_admin_api
    .post(`/_matrix/client/r0/rooms/${room_id}/invite`, {
      user_id,
    })
    .then(() => {
      console.log(`user ${user_id} invited ${room_id}`);
    })
    .catch(logRequestError);
}

async function joinUserToRoom(user_id, room_id) {
  await matrix_admin_api
    .post(`/_synapse/admin/v1/join/${room_id}`, {
      user_id,
    })
    .then(() => {
      console.log(`user ${user_id} joined ${room_id}`);
    })
    .catch(logRequestError);
}

function getUserPowerLevel(room_state, user_id) {
  const state_power_levels = room_state.find((state) => (state.type === 'm.room.power_levels'));
  return state_power_levels.content.users[user_id] || 0;
}

async function setUserPowerLevel(room_state, user_id, user_power_level) {
  const state_power_levels = room_state.find((state) => (state.type === 'm.room.power_levels'));
  state_power_levels.content.users[user_id] = user_power_level;
  return setRoomState(state_power_levels.room_id, 'm.room.power_levels', state_power_levels.content);
}

async function syncRoom(alias, name, topic, is_direct, events_default) {
  const room_id = await getOrCreateRoom(alias, name, topic, is_direct);
  const room_state = await getRoomState(room_id);

  // check name ('m.room.name')
  await syncRoomState(room_state, 'm.room.name', 'name', name);

  // check topic ('m.room.topic')
  await syncRoomState(room_state, 'm.room.topic', 'topic', topic);

  // check join ('m.room.join_rules')
  await syncRoomState(room_state, 'm.room.join_rules', 'join_rule', 'invite');

  // check guest access ('m.room.guest_access')
  await syncRoomState(room_state, 'm.room.guest_access', 'guest_access', 'forbidden');

  // check default power_levels invite ('m.room.power_levels')
  await syncRoomState(room_state, 'm.room.power_levels', 'invite', 70);
  await syncRoomState(room_state, 'm.room.power_levels', 'events_default', events_default);

  // set custom state to mark room as managed
  await syncRoomState(room_state, 'm.room.sync', 'mode', 'managed');

  // 'm.room.history_visibility' = 'shared'

  return room_state;
}

async function syncRoomState(room_state, type, key, value) {
  let state_name = room_state.find((state) => state.type === type);

  // init new state event
  if (!state_name) {
    state_name = {
      room_id: room_state[0].room_id,
      content: {},
    };
  }

  // check if stat has to be updated
  if (state_name.content[key] !== value) {
    state_name.content[key] = value;
    await setRoomState(state_name.room_id, type, state_name.content);
  }
}

async function getOrCreateRoom(alias, name, topic, is_direct) {
  return getRoomByAlias(alias)
    .then((room) => room.room_id)
    .catch(() => createRoom(alias, name, topic, is_direct));
}

async function getRoomByAlias(alias) {
  const server_alias = `%23${alias}:${MATRIX_SERVERNAME}`;
  return matrix_admin_api
    .get(`/_matrix/client/r0/directory/room/${server_alias}`)
    .then((response) => response.data);
}

async function createRoom(alias, room_name, topic, is_direct = false) {
  return matrix_admin_api
    .post('/_matrix/client/r0/createRoom', {
      preset: 'private_chat',
      room_alias_name: alias,
      name: room_name,
      topic,
      is_direct,
      creation_content: {
        'm.federate': false,
      },
    })
    .then((response) => response.data.room_id)
    .catch(logRequestError);
}

async function getRoomState(room_id) {
  return matrix_admin_api
    .get(`/_matrix/client/r0/rooms/${room_id}/state`)
    .then((response) => response.data)
    .catch(logRequestError);
}

async function setRoomState(room_id, state_type, content) {
  return matrix_admin_api
    .put(`/_matrix/client/r0/rooms/${room_id}/state/${state_type}`, content)
    .then(() => {
      console.log(`set room state ${state_type} in ${room_id} to ${content}`);
      return true;
    })
    .catch(logRequestError);
}


// HELPER FUNCTIONS
async function asyncForEach(array, callback) {
  const promises = [];
  for (let index = 0; index < array.length; index += 1) {
    promises.push(callback(array[index], index, array));
  }
  return Promise.all(promises);
}

function logRequestError(error) {
  if (error.response) {
    /*
     * The request was made and the server responded with a
     * status code that falls out of the range of 2xx
     */
    console.error(error.response.status, error.response.data, error.response.headers);
  } else if (error.request) {
    /*
     * The request was made but no response was received, `error.request`
     * is an instance of XMLHttpRequest in the browser and an instance
     * of http.ClientRequest in Node.js
     */
    console.error(error.request);
  } else {
    // Something happened in setting up the request and triggered an Error
    console.error('Error', error.message);
  }

  console.log('for request', error.config);
  throw error;
}
