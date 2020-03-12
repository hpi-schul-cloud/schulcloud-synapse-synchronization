const { Configuration } = require('@schul-cloud/commons');

const MATRIX_DOMAIN = Configuration.get("MATRIX_DOMAIN");
const MATRIX_HOME_DOMAIN = Configuration.get("MATRIX_HOME_DOMAIN");
const RABBIT_MQ = Configuration.get("RABBIT_MQ");
const RABBIT_MQ_QUEUE = Configuration.get("RABBIT_MQ_QUEUE");

var testObj = {
    school:{
     id: "testschoolRC001",
     has_allhands_channel : true,
     name: "Peanuts High 001"
    },
     user: {
      id: "@user06:matrix.stomt.com",//numeric is not allowed
      name: "Dr. Specht",
      is_school_admin: true,
      is_teacher: true,
      tags: ["Mathe", "Sport"] // could be used for global room invites
    },
    rooms:[
        {
            id: '0000122222',
            name: 'Kurs 1',
            type: 'course',
            bidirectional: false,
            is_moderator: true
        },
        {
            id: '000111111',
            name: 'Team 777',
            type: 'team',
            bidirectional: true,
            is_moderator: true
        },
        {
            id: '000004(bi)',
            name: 'team 4',
            type: 'team',
            bidirectional: false,
            is_moderator: false
        },
    ]
}
var testObj2 = {
    school:{
     id: "testschool003",
     has_allhands_channel : true,
     name: "Peanuts High 003"
    },
     user: {
      id: "@test666:matrix.stomt.com",//numeric is not allowed
      name: "Joe Cool",
      is_school_admin: true,
      is_teacher: true,
      tags: ["Mathe", "Sport"] // could be used for global room invites
    },
    rooms:[
    ]
}
var amqp = require('amqplib/callback_api');
var fs = require('fs');

const axios = require('axios');
// read token from file, should be moved to ENv or secrets for prod
var admin_token = fs.readFileSync('token','utf8');

const matrix_admin_api = axios.create({
    baseURL: "https://" + MATRIX_DOMAIN,
    timeout: 10000,
    headers: {'Authorization': 'Bearer '+ admin_token}
  });


amqp.connect(RABBIT_MQ, function(error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = RABBIT_MQ_QUEUE;

    channel.assertQueue(queue, {
      durable: false
    });

    console.log(" [*] Waiting for messages in %s.", queue);

    channel.consume(queue, function(msg) {
        console.log(" [x] Received %s", msg.content.toString());
        this.syncUserWithMatrix(msg.content);
    }, {
        noAck: true //TODO: check this setting
    });
  });
});

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
};

async function syncUserWithMatrix(payload){
  let user_id = payload.user.id;
  let user_already_present = false;
  // check if user exists
  await matrix_admin_api.get('/_synapse/admin/v2/users/'+user_id)
    .then(function (response) {
        if (response.status == 200){
            user_already_present = true;
            console.log("user " + user_id + " found");
        }
    })
    .catch(function (error) {
        console.log("user not there yet");
    }
  );
  // PUT /_synapse/admin/v2/users/<user_id>
  if (user_already_present == false){
    console.log("create user " + payload.user.name);
    await matrix_admin_api.put('/_synapse/admin/v2/users/' + user_id, {
            "password": Math.random().toString(36), // we will never use this, password login should be disabled
            "displayname": payload.user.name,
            "admin": false,
            "deactivated": false
      })
    .then(function (response) {
        console.log("user created");
    })
    .catch(function (error) {
        console.log(error);
    })
  }

  if (payload.rooms){
    asyncForEach(payload.rooms, async (room) => {
        let alias = room.type + "_" + room.id;
        var fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
        let [room_matrix_id] = await createRoom(fq_alias, alias, room.name, payload.school.name);
        await joinUserToRoom(user_id, room_matrix_id);
        // check if exists and permissions levels are what we want
        var desiredUserPower = 50;
        if (room.bidirectional == true){
            desiredUserPower = 0;
        }
        // this can run async
        setRoomEventsDefault(room_matrix_id, desiredUserPower);
        setModerator(room_matrix_id, payload.user.id, room.is_moderator);
    });
  }

    // always join user (previous check can be implemented later)
    if (payload.school.has_allhands_channel) {
        let room_name = "Ankündigungen";
        let topic = "Ankündigungen der " + payload.school.name;
        let alias = "news_" + payload.school.id;
        var fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
        var [room_matrix_id, current_permission] = await createRoom(fq_alias, alias, room_name, payload.school.name, topic, payload.user.is_school_admin? payload.user.id : null );
        setRoomEventsDefault(room_matrix_id, 50);
        await joinUserToRoom(user_id, room_matrix_id);
        if (payload.user.is_school_admin && current_permission != 50) {
            setModerator(room_matrix_id, payload.user.id, true);
        }
     }else{
        //TODO: delete or block room if setting is changed
     }

     //lehrerzimmer
     if (payload.user.is_teacher == true) {
        let room_name = "Lehrerzimmer";
        let topic = "Lehrerzimmer der " + payload.school.name;
        let alias = "teachers_" + payload.school.id;
        var fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
        var [room_matrix_id, current_permission] = await createRoom(fq_alias, alias, room_name, payload.school.name, topic);
        // setRoomEventsDefault(room_matrix_id, 50);
        await joinUserToRoom(user_id, room_matrix_id);
        if (payload.user.is_school_admin && current_permission != 50) {
            setModerator(room_matrix_id, payload.user.id, true);
        }
     }
};

// check if room exists, if not create
async function setRoomEventsDefault(room_matrix_id, events_default){
    var room_state = await getRoomState(room_matrix_id);
    if (room_state && room_state.events_default != events_default){
        room_state.events_default = events_default;
        await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
        .then(function (response) {
        })
        .catch(function (error) {
            console.log(error);
        }
        )
    }
}

async function joinUserToRoom(user_id, room_id){
    // join user
    // !TODO: Check if the user is already in the room to avoid reseting the user state
    // note that we need to encode the #
    //POST /_matrix/client/r0/rooms/{roomId}/invite
     await matrix_admin_api.post('/_matrix/client/r0/rooms/' + room_id + '/invite', {
         user_id: user_id
     })
     .then(function (response) {
         if (response.status == 200){
             console.log("user " + user_id + " invited " + room_id);
         }
     })
     .catch(function (error) {
        // user may already be in the room
       }
     )
     await matrix_admin_api.post('/_synapse/admin/v1/join/' + room_id, {
         user_id: user_id
     })
     .then(function (response) {
         if (response.status == 200){
             console.log("user " + user_id + " joined " + room_id);
         }
     })
     .catch(function (error) {
         console.log(error);
       }
     )
}

// returns room_matrix_id
async function createRoom(fq_alias, alias, room_name, school_name, topic = null, user_id = null){
    let room_already_present = false;
    // console.log("check room " + fq_alias);
        var room_matrix_id = null;
        var current_user_level = null;
        await matrix_admin_api.get('/_matrix/client/r0/directory/room/' + fq_alias)
        .then(function (response) {
            if (response.status == 200){
                room_already_present = true;
                room_matrix_id = response.data.room_id;
                console.log("room " + room_matrix_id + " found");
                var current_permission = null;
            }
        })
        .catch(function (error) {
            console.log("room " + fq_alias + " not found");
        })

        if (user_id && room_matrix_id) {
            var room_state = await matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state').then(function (response) {
                if (response.status == 200){
                    if (response.data && response.data.users && response.data.users[user_id]){
                        current_user_level = response.data.users[user_id];
                    };
                }
            })
            .catch(function (error) {
                console.log(error);
            }
            )
        }

        // TODO: Update room title if needed
        //create room
        if (room_already_present == false){
            await matrix_admin_api.post('/_matrix/client/r0/createRoom', {
                "preset": "private_chat", // this allows guest, we might want to disallow this later
                "room_alias_name": alias,
                "name": room_name,
                "topic": topic? topic : "Kanal für " + room_name + " (" + school_name + ")",
                "creation_content": {
                }
            })
            .then(function (response) {
                if (response.status == 200){
                    room_already_present = true;
                    room_matrix_id = response.data.room_id;
                    console.log("room " + room_matrix_id + " created");
                }
            })
            .catch(function (error) {
                console.log("room " + alias + " not found");
              }
            )
        }
        // user_permission_
        return [room_matrix_id, current_user_level];
}

async function getRoomState(room_matrix_id){
    var data = null;
    await matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels').then(function (response) {
        if (response.status == 200){
            data = response.data;
        }
    }).catch(function (error) {
        console.log(error);
    }
    )
    return data;
}

async function setRoomState(room_matrix_id, room_state){
    await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
    .then(function (response) {
        console.log("set mod right for " + user_id + " in " + room_matrix_id );
    })
    .catch(function (error) {
        console.log(error);
    }
    )
    return;
}

async function setModerator(room_matrix_id, user_id, is_moderator){
    // check moderator
    var room_state = await getRoomState(room_matrix_id);
    if (is_moderator && room_state && room_state.users) {
        if (!(room_state.users[user_id] && room_state.users[user_id] == 50)){
            room_state.users[user_id] = 50;
            await setRoomState(room_matrix_id, room_state)
        }else{
            console.log("user is already a moderator");
        }
        //TODO: Delete moderator if value is false
    }else if (room_state && room_state.user && room_state.users[user_id] && room_state.users[user_id] == 50){
        delete room_state.users[user_id];
        await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
        .then(function (response) {
            console.log(response.data);
        })
        .catch(function (error) {
            console.log(error);
        }
        )
    }
}

// run for dev testing
syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);
// syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);
// syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);syncUserWithMatrix(testObj);
// syncUserWithMatrix(testObj2);