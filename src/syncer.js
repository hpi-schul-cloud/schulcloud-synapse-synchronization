const {Configuration} = require('@schul-cloud/commons');
const axios = require('axios');

const MATRIX_URI = Configuration.get('MATRIX_URI');
const MATRIX_SERVERNAME = Configuration.get('MATRIX_SERVERNAME');
const MATRIX_SYNC_USER_TOKEN = Configuration.get('MATRIX_SYNC_USER_TOKEN');

module.exports = {
  syncUserWithMatrix: syncUserWithMatrix,

  getOrCreateUser: getOrCreateUser,
  createUser: createUser,
};

// SETUP API
const axios_matrix_admin_api = axios.create({
  baseURL: MATRIX_URI,
  timeout: 10000,
  headers: {'Authorization': 'Bearer ' + MATRIX_SYNC_USER_TOKEN}
});

const matrix_admin_api = {
  get: (first, second, third = null) => {
    return call('get', first, second, third);
  },
  put: (first, second, third) => {
    return call('put', first, second, third);
  },
  post: (first, second, third) => {
    return call('post', first, second, third);
  },
};

function call(func, first, second, third) {
  return axios_matrix_admin_api[func](first, second, third)
    .catch(async (error) => {
      if (error.response && error.response.status === 429) {
        const timeToWait = error.response.data.retry_after_ms + 100;
        console.warn(`Waiting for ${timeToWait}ms...`);
        await sleep(timeToWait);
        return matrix_admin_api[func](first, second, third);
      } else {
        throw error
      }
    });
}

// PUBLIC FUNCTIONS
async function syncUserWithMatrix(payload) {
  let user_id = payload.user.id;
  await getOrCreateUser(payload.user);

  if (payload.rooms) {
    await asyncForEach(payload.rooms, async (room) => {
      const alias = room.type + "_" + room.id;
      const fq_alias = "%23" + alias + ":" + MATRIX_SERVERNAME;

      const room_matrix_id = await getOrCreateRoom(fq_alias, alias, room.name, payload.school.name);
      await joinUserToRoom(user_id, room_matrix_id);

      // check if exists and permissions levels are what we want
      let desiredUserPower = 50;
      if (room.bidirectional === true) {
        desiredUserPower = 0;
      }

      // this can run async
      await Promise.all([
        setRoomEventsDefault(room_matrix_id, desiredUserPower),
        setModerator(room_matrix_id, payload.user.id, room.is_moderator),
      ])
    });
  }

  // always join user (previous check can be implemented later)
  if (payload.school.has_allhands_channel) {
    const room_name = "Ankündigungen";
    const topic = "Ankündigungen der " + payload.school.name;
    const alias = "news_" + payload.school.id;
    const fq_alias = "%23" + alias + ":" + MATRIX_SERVERNAME;

    const room_matrix_id = await getOrCreateRoom(fq_alias, alias, room_name, payload.school.name, topic);
    const current_permission = payload.user.is_school_admin ? await getUserRoomLevel(room_matrix_id, payload.user.id) : null;
    await setRoomEventsDefault(room_matrix_id, 50);
    await joinUserToRoom(user_id, room_matrix_id);

    if (payload.user.is_school_admin && current_permission !== 50) {
      await setModerator(room_matrix_id, payload.user.id, true);
    }
  } else {
    //TODO: delete or block room if setting is changed
  }

  // Lehrerzimmer
  if (payload.user.is_teacher === true) {
    const room_name = "Lehrerzimmer";
    const topic = "Lehrerzimmer der " + payload.school.name;
    const alias = "teachers_" + payload.school.id;
    const fq_alias = "%23" + alias + ":" + MATRIX_SERVERNAME;

    const room_matrix_id = await getOrCreateRoom(fq_alias, alias, room_name, payload.school.name, topic);
    const current_permission = null;
    // setRoomEventsDefault(room_matrix_id, 50);
    await joinUserToRoom(user_id, room_matrix_id);

    if (payload.user.is_school_admin && current_permission !== 50) {
      await setModerator(room_matrix_id, payload.user.id, true);
    }
  }
}

// INTERNAL FUNCTIONS
async function getOrCreateUser(user) {
  // check if user exists
  // Docu: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst#query-account
  await matrix_admin_api
    .get('/_synapse/admin/v2/users/' + user.id)
    .then(function(_) {
      console.log("user " + user.id + " found.");
    })
    .catch(function(_) {
      console.log("user " + user.id + " not there yet.");
      return createUser(user);
    });
}

async function createUser(user) {
  // Docu: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst#create-or-modify-account
  let newUser = {
    "password": Math.random().toString(36), // we will never use this, password login should be disabled
    "displayname": user.name,
    "threepids": [],
    "admin": false,
    "deactivated": false
  };
  if (user.email) {
    newUser.threepids.push({
      "medium": "email",
      "address": user.email,
    });
  }

  return matrix_admin_api
    .put('/_synapse/admin/v2/users/' + user.id, newUser)
    .then(function(_) {
      console.log("user " + user.id + " created.");
    })
    .catch(logRequestError)
}

async function setRoomEventsDefault(room_matrix_id, events_default) {
  const room_state = await getRoomState(room_matrix_id);
  if (room_state && room_state.events_default !== events_default) {
    room_state.events_default = events_default;
    await matrix_admin_api
      .put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
      .catch(logRequestError)
  }
}

async function joinUserToRoom(user_id, room_id) {
  // TODO: Check if the user is already in the room to avoid reseting the user state

  // Send invite
  await matrix_admin_api
    .post('/_matrix/client/r0/rooms/' + room_id + '/invite', {
      user_id: user_id
    })
    .then(function(response) {
      if (response.status === 200) {
        console.log("user " + user_id + " invited " + room_id);
      }
    })
    .catch(function(error) {
      // user may already be in the room
    });

  // Accept invite
  await matrix_admin_api
    .post('/_synapse/admin/v1/join/' + room_id, {
      user_id: user_id
    })
    .then(function(response) {
      if (response.status === 200) {
        console.log("user " + user_id + " joined " + room_id);
      }
    })
    .catch(logRequestError)
}

async function getOrCreateRoom(fq_alias, alias, room_name, school_name, topic = null) {
  // get room id
  return matrix_admin_api
    .get('/_matrix/client/r0/directory/room/' + fq_alias)
    .then(function(response) {
      console.log("room " + response.data.room_id + " found");
      return response.data.room_id;
    })
    .catch(async () => {
      console.log("room " + fq_alias + " not found");
      return createRoom(alias, room_name, school_name, topic);
    });
}

async function createRoom(alias, room_name, school_name, topic) {
  return matrix_admin_api
    .post('/_matrix/client/r0/createRoom', {
      "preset": "private_chat", // this allows guest, we might want to disallow this later
      "room_alias_name": alias,
      "name": room_name,
      "topic": topic ? topic : "Kanal für " + room_name + " (" + school_name + ")",
      "creation_content": {}
    })
    .then(async (response) => {
      const room_matrix_id = response.data.room_id;
      const tmp_state = await getRoomState(room_matrix_id);
      tmp_state.invite = 70;
      await setRoomState(room_matrix_id, tmp_state);
      return room_matrix_id;
    })
    .catch(logRequestError);
}

async function getUserRoomLevel(room_matrix_id, user_id) {
  return matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state')
    .then(function(response) {
      if (response.status === 200) {
        if (response.data && response.data.users && response.data.users[user_id]) {
          return response.data.users[user_id];
        }
      }
    })
    .catch(logRequestError)
}

async function getRoomState(room_matrix_id) {
  return matrix_admin_api
    .get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels')
    .then(function(response) {
      return response.data;
    })
    .catch(logRequestError);
}

async function setRoomState(room_matrix_id, room_state) {
  return matrix_admin_api
    .put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
    .then(() => {
      console.log("set roomm state in " + room_matrix_id);
      return true;
    })
    .catch(logRequestError);
}

async function setModerator(room_matrix_id, user_id, is_moderator) {
  // check moderator
  const room_state = await getRoomState(room_matrix_id);
  if (is_moderator && room_state && room_state.users) {
    if (!(room_state.users[user_id] && room_state.users[user_id] === 50)) {
      room_state.users[user_id] = 50;
      await setRoomState(room_matrix_id, room_state)
    } else {
      console.log("user is already a moderator");
    }
    //TODO: Delete moderator if value is false
  } else if (room_state && room_state.user && room_state.users[user_id] && room_state.users[user_id] === 50) {
    delete room_state.users[user_id];
    await matrix_admin_api
      .put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
      .then(function(response) {
        console.log(response.data);
      })
      .catch(logRequestError);
  }
}

async function asyncForEach(array, callback) {
  const promises = [];
  for (let index = 0; index < array.length; index++) {
    promises.push(callback(array[index], index, array));
  }
  return Promise.all(promises);
}

// HELPER FUNCTIONS
function logRequestError(error) {
  console.error(error.response);
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
