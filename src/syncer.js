const {Configuration} = require('@schul-cloud/commons');
const secrets = require('./secrets');
const axios = require('axios');

const MATRIX_DOMAIN = Configuration.get("MATRIX_DOMAIN");
const MATRIX_SYNC_USER_TOKEN = secrets.matrix_sync_user_token;

const axios_matrix_admin_api = axios.create({
  baseURL: 'https://' + MATRIX_DOMAIN,
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
      if (error.response.status === 429) {
        const timeToWait = error.response.data.retry_after_ms + 100;
        console.warn(`Waiting for ${timeToWait}ms...`);
        await sleep(timeToWait);
        return matrix_admin_api[func](first, second, third);
      } else {
        throw error
      }
    });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  syncUserWithMatrix: syncUserWithMatrix,
};

async function syncUserWithMatrix(payload) {
  let user_id = payload.user.id;
  let user_already_present = false;
  // check if user exists
  await matrix_admin_api.get('/_synapse/admin/v2/users/' + user_id)
    .then(function(response) {
      if (response.status === 200) {
        user_already_present = true;
        console.log("user " + user_id + " found");
      }
    })
    .catch(function(_) {
        console.log("user not there yet");
      }
    );
  // PUT /_synapse/admin/v2/users/<user_id>
  if (user_already_present === false) {
    console.log("create user " + payload.user.name);
    await matrix_admin_api.put('/_synapse/admin/v2/users/' + user_id, {
      "password": Math.random().toString(36), // we will never use this, password login should be disabled
      "displayname": payload.user.name,
      "admin": false,
      "deactivated": false
    })
      .then(function(_) {
        console.log("user created");
      })
      .catch(logRequestError)
  }

  if (payload.rooms) {
    await asyncForEach(payload.rooms, async (room) => {
      const alias = room.type + "_" + room.id;
      const fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
      let [room_matrix_id] = await createRoom(fq_alias, alias, room.name, payload.school.name);
      await joinUserToRoom(user_id, room_matrix_id);
      // check if exists and permissions levels are what we want
      let desiredUserPower = 50;
      if (room.bidirectional === true) {
        desiredUserPower = 0;
      }
      // this can run async
      await setRoomEventsDefault(room_matrix_id, desiredUserPower);
      await setModerator(room_matrix_id, payload.user.id, room.is_moderator);
    });
  }

  // always join user (previous check can be implemented later)
  if (payload.school.has_allhands_channel) {
    let room_name = "Ankündigungen";
    let topic = "Ankündigungen der " + payload.school.name;
    let alias = "news_" + payload.school.id;
    const fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
    const [room_matrix_id, current_permission] = await createRoom(fq_alias, alias, room_name, payload.school.name, topic, payload.user.is_school_admin ? payload.user.id : null);
    await setRoomEventsDefault(room_matrix_id, 50);
    await joinUserToRoom(user_id, room_matrix_id);
    if (payload.user.is_school_admin && current_permission !== 50) {
      await setModerator(room_matrix_id, payload.user.id, true);
    }
  } else {
    //TODO: delete or block room if setting is changed
  }

  // lehrerzimmer
  if (payload.user.is_teacher === true) {
    let room_name = "Lehrerzimmer";
    let topic = "Lehrerzimmer der " + payload.school.name;
    let alias = "teachers_" + payload.school.id;
    const fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
    const [room_matrix_id, current_permission] = await createRoom(fq_alias, alias, room_name, payload.school.name, topic);
    // setRoomEventsDefault(room_matrix_id, 50);
    await joinUserToRoom(user_id, room_matrix_id);
    if (payload.user.is_school_admin && current_permission !== 50) {
      await setModerator(room_matrix_id, payload.user.id, true);
    }
  }
}

// check if room exists, if not create
async function setRoomEventsDefault(room_matrix_id, events_default) {
  const room_state = await getRoomState(room_matrix_id);
  if (room_state && room_state.events_default !== events_default) {
    room_state.events_default = events_default;
    await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
      .then(function(response) {
      })
      .catch(logRequestError)
  }
}

async function joinUserToRoom(user_id, room_id) {
  // join user
  // !TODO: Check if the user is already in the room to avoid reseting the user state
  // note that we need to encode the #
  //POST /_matrix/client/r0/rooms/{roomId}/invite
  await matrix_admin_api.post('/_matrix/client/r0/rooms/' + room_id + '/invite', {
    user_id: user_id
  })
    .then(function(response) {
      if (response.status === 200) {
        console.log("user " + user_id + " invited " + room_id);
      }
    })
    .catch(function(error) {
        // user may already be in the room
      }
    );
  await matrix_admin_api.post('/_synapse/admin/v1/join/' + room_id, {
    user_id: user_id
  })
    .then(function(response) {
      if (response.status === 200) {
        console.log("user " + user_id + " joined " + room_id);
      }
    })
    .catch(logRequestError)
}

// returns room_matrix_id
async function createRoom(fq_alias, alias, room_name, school_name, topic = null, user_id = null) {
  let room_already_present = false;
  let room_matrix_id = null;
  let current_user_level = null;
  await matrix_admin_api.get('/_matrix/client/r0/directory/room/' + fq_alias)
    .then(function(response) {
      if (response.status === 200) {
        room_already_present = true;
        room_matrix_id = response.data.room_id;
        console.log("room " + room_matrix_id + " found");
      }
    })
    .catch(function(_) {
      console.log("room " + fq_alias + " not found");
    });

  if (user_id && room_matrix_id) {
    await matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state')
      .then(function(response) {
        if (response.status === 200) {
          if (response.data && response.data.users && response.data.users[user_id]) {
            current_user_level = response.data.users[user_id];
          }
        }
      })
      .catch(logRequestError)
  }

  // TODO: Update room title if needed
  //create room
  if (room_already_present === false) {
    await matrix_admin_api.post('/_matrix/client/r0/createRoom', {
      "preset": "private_chat", // this allows guest, we might want to disallow this later
      "room_alias_name": alias,
      "name": room_name,
      "topic": topic ? topic : "Kanal für " + room_name + " (" + school_name + ")",
      "creation_content": {}
    })
      .then(function(response) {
        if (response.status === 200) {
          room_already_present = true;
          room_matrix_id = response.data.room_id;
          console.log("room " + room_matrix_id + " created");
        }
      })
      .catch(function(_) {
          console.log("room " + alias + " not found");
        }
      );
    const tmp_state = await getRoomState(room_matrix_id);
    tmp_state.invite = 70;
    await setRoomState(room_matrix_id, tmp_state);
  }
  // user_permission_
  return [room_matrix_id, current_user_level];
}

async function getRoomState(room_matrix_id) {
  return matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels').then(function(response) {
    if (response.status === 200) {
      return response.data;
    }
    return null;
  }).catch(logRequestError);
}

async function setRoomState(room_matrix_id, room_state) {
  return matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
    .then(function(_) {
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
    await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
      .then(function(response) {
        console.log(response.data);
      })
      .catch(logRequestError);
  }
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}


function logRequestError(error) {
  console.error(error.response);
}
