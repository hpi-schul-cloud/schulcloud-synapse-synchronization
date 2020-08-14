const {Configuration} = require('@schul-cloud/commons');
const fs = require('fs');
const matrix_admin_api = require('./matrixApi');

const EVENT_DEFAULT_ALL = 0;
const EVENT_DEFAULT_MOD_ONLY = 50;
const POWER_LEVEL_USER = 0;
const POWER_LEVEL_MOD = 50;
const POWER_LEVEL_MANGE_MEMBERS = 70;
// const POWER_LEVEL_ADMIN = 100; // should not be used because sync user requires a higher level to manage users

module.exports = {
  syncUserWithMatrix,
  setupSyncUser,

  getOrCreateUser,
  createUser,
  syncRoom,
  syncRoomMember,
  deleteRoom,
  getRooms,
  getUsers,
  kickUser,
  sendMessage,
  syncDirectRoom,
  deactivateUser,
};

// PUBLIC FUNCTIONS
async function syncUserWithMatrix(payload) {
  const user_id = payload.user.id;
  const userFoundOrCreated = await getOrCreateUser(payload.user);

  const welcomeMessage = getWelcomeMessage(payload);

  if (userFoundOrCreated === 'created' && welcomeMessage) {
    // create private room
    const from = user_id.indexOf('_') !== -1 ? user_id.indexOf('_') + 1 : 1;
    const alias = `sync_${user_id.slice(from, user_id.indexOf(':'))}`;
    const room_id = await syncDirectRoom(alias, Configuration.get('MATRIX_SYNC_USER_DISPLAYNAME'), '', [user_id]);

    // send welcome message
    const message = {
      msgtype: 'm.text',
      body: welcomeMessage,
    };
    await sendMessage(room_id, message);
  }

  if (payload.rooms) {
    await asyncForEach(payload.rooms, async (room) => {
      const alias = `${room.type}_${room.id}`;
      const topic = room.description || (room.type === 'team' && 'Team') || (room.type === 'course' && 'Kurs') || `Kanal für ${room.name} (${payload.school.name})`;
      const events_default = room.bidirectional ? EVENT_DEFAULT_ALL : EVENT_DEFAULT_MOD_ONLY;
      const room_state = await syncRoom(alias, room.name, topic, events_default);

      const user_power_level = room.is_moderator ? POWER_LEVEL_MOD : POWER_LEVEL_USER;
      await syncRoomMember(room_state, user_id, user_power_level);
    });
  }

  // always join user (previous check can be implemented later)
  if (payload.school.has_allhands_channel) {
    const room_name = 'Ankündigungen';
    const topic = `${payload.school.name}`;
    const alias = `news_${payload.school.id}`;
    const room_state = await syncRoom(alias, room_name, topic, EVENT_DEFAULT_MOD_ONLY);

    const user_power_level = payload.user.is_school_admin ? POWER_LEVEL_MOD : POWER_LEVEL_USER;
    await syncRoomMember(room_state, user_id, user_power_level);
  } else {
    const alias = `news_${payload.school.id}`;
    await getRoomByAlias(alias)
      .then((room) => room.room_id)
      .then(deleteRoom)
      .catch(() => {}); // room does not exist
  }

  // Lehrerzimmer
  if (payload.user.is_school_teacher === true) {
    const room_name = 'Lehrerzimmer';
    const topic = `${payload.school.name}`;
    const alias = `teachers_${payload.school.id}`;
    const room_state = await syncRoom(alias, room_name, topic, EVENT_DEFAULT_ALL);

    const user_power_level = payload.user.is_school_admin ? POWER_LEVEL_MOD : POWER_LEVEL_USER;
    await syncRoomMember(room_state, user_id, user_power_level);
  }
}

async function setupSyncUser() {
  const username = Configuration.get('MATRIX_SYNC_USER_NAME');
  const servername = Configuration.get('MATRIX_SERVERNAME');
  const matrixId = `@${username}:${servername}`;
  console.log(`setupSyncUser ${matrixId}`);

  // set avatar
  const currentAvatar = await getProfile(matrixId, 'avatar_url');
  console.log(`${matrixId} avatar: ${currentAvatar}`);
  if (!currentAvatar) {
    const content_uri = await uploadFile('avatar.png', './data/avatar.png', 'image/png');
    await setProfile(matrixId, 'avatar_url', content_uri);
  }

  // set displayname
  const displayname = Configuration.get('MATRIX_SYNC_USER_DISPLAYNAME');
  console.log(`${matrixId} displayname: ${displayname}`);
  const currentDisplayname = await getProfile(matrixId, 'displayname');
  if (displayname && currentDisplayname !== displayname) {
    await setProfile(matrixId, 'displayname', displayname);
  }
}

// INTERNAL FUNCTIONS
function getWelcomeMessage(payload) {
  let welcomeMessage;

  if (payload.user.is_school_admin) {
    welcomeMessage = Configuration.has('WELCOME_MESSAGE_ADMIN') ? Configuration.get('WELCOME_MESSAGE_ADMIN') : null;
  } else if (payload.user.is_school_teacher) {
    welcomeMessage = Configuration.has('WELCOME_MESSAGE_TEACHER') ? Configuration.get('WELCOME_MESSAGE_TEACHER') : null;
  } else {
    welcomeMessage = Configuration.has('WELCOME_MESSAGE_STUDENT') ? Configuration.get('WELCOME_MESSAGE_STUDENT') : null;
  }

  if (payload.welcome && payload.welcome.text) {
    welcomeMessage = payload.welcome.text;
  }

  if (welcomeMessage) {
    welcomeMessage = welcomeMessage.replace(/\\n/g, '\n');
  }

  return welcomeMessage;
}

async function sendMessage(room_id, message) {
  return matrix_admin_api
    .post(`/_matrix/client/r0/rooms/${room_id}/send/m.room.message`, message)
    .then(() => {
      console.log('Message sent.');
    })
    .catch(logRequestError);
}

async function deactivateUser(user) {
  return matrix_admin_api
    .post(`/_synapse/admin/v1/deactivate/${user.id}`, { "erase": true })
    .then(console.log)
    .catch(console.error);
}
async function getOrCreateUser(user) {
  // check if user exists
  // Docu: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst#query-account
  return matrix_admin_api
    .get(`/_synapse/admin/v2/users/${user.id}`)
    .then((response) => response.data)
    .then(async (data) => {
      console.log(`user ${user.id} found.`);

      // check displayname
      if (data.displayname !== user.name) {
        await setProfile(user.id, 'displayname', user.name);
      }

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
  return state_power_levels.content.users[user_id] || POWER_LEVEL_USER;
}

async function setUserPowerLevel(room_state, user_id, user_power_level) {
  const state_power_levels = room_state.find((state) => (state.type === 'm.room.power_levels'));
  state_power_levels.content.users[user_id] = user_power_level;
  return setRoomState(state_power_levels.room_id, 'm.room.power_levels', state_power_levels.content);
}

async function syncDirectRoom(alias, name, topic, user_ids) {
  const room_id = await getOrCreateDirectRoom(alias, name, topic, user_ids);
  const room_state = await getRoomState(room_id);

  // check name ('m.room.name')
  await syncRoomState(room_state, 'm.room.name', 'name', name);

  // check topic ('m.room.topic')
  await syncRoomState(room_state, 'm.room.topic', 'topic', topic);

  // check members
  const promises = user_ids.map(async (user_id) => {
    const state_member = room_state.find((state) => (state.type === 'm.room.member' && state.user_id === user_id));
    if (state_member && state_member.content.membership === 'leave') {
      return inviteUserToRoom(user_id, room_state[0].room_id);
    }
    return true;
  });
  await Promise.all(promises);

  return room_id;
}

async function syncRoom(alias, name, topic, events_default) {
  const room_id = await getOrCreateRoom(alias, name, topic);
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
  await syncRoomState(room_state, 'm.room.power_levels', 'invite', POWER_LEVEL_MANGE_MEMBERS);
  await syncRoomState(room_state, 'm.room.power_levels', 'ban', POWER_LEVEL_MANGE_MEMBERS);
  await syncRoomState(room_state, 'm.room.power_levels', 'kick', POWER_LEVEL_MANGE_MEMBERS);
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

async function getOrCreateRoom(alias, name, topic) {
  return getRoomByAlias(alias)
    .then((room) => room.room_id)
    .catch(() => createRoom(alias, name, topic));
}

async function getOrCreateDirectRoom(alias, name, topic, user_ids) {
  return getRoomByAlias(alias)
    .then((room) => room.room_id)
    .catch(() => createDirectRoom(alias, name, topic, user_ids));
}

async function getRoomByAlias(alias) {
  const servername = Configuration.get('MATRIX_SERVERNAME');
  const server_alias = `%23${alias}:${servername}`;
  return matrix_admin_api
    .get(`/_matrix/client/r0/directory/room/${server_alias}`)
    .then((response) => response.data);
}

async function createRoom(alias, name, topic) {
  const body = {
    preset: 'private_chat',
    room_alias_name: alias,
    name,
    topic,
    creation_content: {
      'm.federate': false,
    },
    initial_state: [{type: 'm.room.guest_access', state_key: '', content: {guest_access: 'forbidden'}}],
  };

  return matrix_admin_api
    .post('/_matrix/client/r0/createRoom', body)
    .then((response) => response.data.room_id)
    .catch(logRequestError);
}

async function createDirectRoom(alias, name, topic, user_ids) {
  const body = {
    preset: 'private_chat',
    room_alias_name: alias,
    visibility: 'private',
    invite: user_ids,
    name,
    topic,
    is_direct: true,
    creation_content: {
      'm.federate': false,
    },
    initial_state: [{type: 'm.room.guest_access', state_key: '', content: {guest_access: 'forbidden'}}],
  };

  return matrix_admin_api
    .post('/_matrix/client/r0/createRoom', body)
    .then((response) => response.data.room_id)
    .then((room_id) => {
      console.log(`Room ${alias} (${room_id}) created.`);
      return room_id;
    })
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

async function uploadFile(file_name, file_path, content_type) {
  const request_config = {
    headers: {
      'content-type': content_type,
    },
  };

  return matrix_admin_api
    .post(`/_matrix/media/r0/upload?filename=${file_name}`, fs.createReadStream(file_path), request_config)
    .then((response) => {
      console.log(`File ${file_name} upladed.`);
      return response.data.content_uri;
    })
    .catch(logRequestError);
}

async function getProfile(user_id, attribute) {
  return matrix_admin_api
    .get(`/_matrix/client/r0/profile/${user_id}/${attribute}`)
    .then((response) => response.data[attribute])
    .catch(logRequestError);
}

async function setProfile(user_id, attribute, value) {
  const body = {
    [attribute]: value,
  };

  return matrix_admin_api
    .put(`/_matrix/client/r0/profile/${user_id}/${attribute}`, body, { timeout: 100000 })
    .then(() => {
      console.log(`${attribute} set for ${user_id}.`);
    })
    .catch((err) => {
      console.log(`Failed to set ${attribute} for ${user_id}.`);
      console.warn(err);
    });
}

async function getRooms(options = {}) {
  return matrix_admin_api
    .get('/_synapse/admin/v1/rooms', options)
    .then((response) => response.data)
    .catch(logRequestError);
}

async function getUsers(options = {}) {
  return matrix_admin_api
    .get('/_synapse/admin/v2/users', options)
    .then((response) => response.data)
    .catch(logRequestError);
}

// Users can only be deactivated, the user_id will be blocked and can only be again activated in the database
// async function deleteUser(user_id, erase = true) {
//   return matrix_admin_api
//     .post(`/_synapse/admin/v1/deactivate/${user_id}`, { erase })
//     .then((response) => response.data)
//     .catch(logRequestError);
// }

async function deleteRoom(room_id) {
  const username = Configuration.get('MATRIX_SYNC_USER_NAME');
  const servername = Configuration.get('MATRIX_SERVERNAME');
  const sync_user_id = `@${username}:${servername}`;

  // kick everybody
  const reason = 'Room closed / Raum geschlossen';
  const members = await getRoomMembers(room_id);
  const membersToBeKicked = members.filter((member) => member.user_id !== sync_user_id && member.content.membership === 'join');
  const promises = membersToBeKicked.map((member) => kickUser(room_id, member.user_id, reason));
  await Promise.all(promises);
  await kickUser(room_id, sync_user_id, reason);

  // delete room
  await pruneRoom(room_id);
}

async function getRoomMembers(room_id) {
  // https://matrix.org/docs/spec/client_server/r0.5.0#get-matrix-client-r0-rooms-roomid-members
  return matrix_admin_api
    .get(`/_matrix/client/r0/rooms/${room_id}/members`)
    .then((response) => response.data)
    .then((data) => data.chunk)
    .catch(logRequestError);
}

async function kickUser(room_id, user_id, reason = '') {
  // kick: https://matrix.org/docs/spec/client_server/r0.5.0#post-matrix-client-r0-rooms-roomid-kick
  const body = {
    user_id,
    reason,
  };
  return matrix_admin_api
    .post(`/_matrix/client/r0/rooms/${room_id}/kick`, body)
    .then((response) => response.data)
    .catch(logRequestError);
}

async function pruneRoom(room_id) {
  // https://github.com/matrix-org/synapse/blob/master/docs/admin_api/purge_room.md
  const body = {
    room_id,
  };
  return matrix_admin_api
    .post('/_synapse/admin/v1/purge_room', body)
    .then((response) => response.data)
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
