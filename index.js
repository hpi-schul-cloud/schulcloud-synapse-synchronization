
var testObj = {
    school:{
     id: 1223435,
     has_allhands_channel : true,
     name: "Peanuts High"
    },
     user: {
      id: "@user:matrix.stomt.com",//numeric is not allowed
      name: "Joe Cools Katze",
      is_school_admin: true
    },
    rooms:[
        {
            id: '12345sssdds6s61ddd2dd212',
            name: 'Accouncement Test',
            type: 'course',
            announcements_only: true,
            is_moderator: true 
        },
        {
            id: 'sdgdfsgeeddffewsdfg',
            name: 'Kurs 5 (bidirektional)',
            type: 'course',
            announcements_only: false,
            is_moderator: false 
        },
    ]
}

var amqp = require('amqplib/callback_api');
var fs = require('fs');

const MATRIX_DOMAIN = "matrix.stomt.com"; //without trailing slash
const axios = require('axios');
// read token from file, should be moved to ENv or secrets for prod
var admin_token = fs.readFileSync('token','utf8');

const matrix_admin_api = axios.create({
    baseURL: "https://" + MATRIX_DOMAIN,
    timeout: 10000,
    headers: {'Authorization': 'Bearer '+ admin_token}
  });

// this can be localhost, in production we can take care of 
// forwarding the ports to all containers
// amqp.connect('amqp://localhost', function(error0, connection) {
//   if (error0) {
//     throw error0;
//   }
//   connection.createChannel(function(error1, channel) {
//     if (error1) {
//       throw error1;
//     }
//     var queue = 'matrix_sync_populated';

//     channel.assertQueue(queue, {
//       durable: false
//     });

//     console.log(" [*] Waiting for messages in %s.", queue);

//     channel.consume(queue, function(msg) {
//         console.log(" [x] Received %s", msg.content.toString());
//         this.syncUserWithMatrix(msg.content);
//     }, {
//         noAck: true
//     });
//   });
// });

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
};

async function syncUserWithMatrix(payload){

  let default_room_params = {};
  let user_id = payload.user.id;
  let user_already_present = false;
  // check if user exists
  // GET /_synapse/admin/v2/users/<user_id>
  await matrix_admin_api.get('/_synapse/admin/v2/users/'+user_id)
    .then(function (response) {
        if (response.status == 200){
            user_already_present = true;
            console.log("user " + user_id + " found");
        }
        //do we need something from the user?
    })
    .catch(function (error) {
        // handle error
        console.log("user not there yet");
    }
  );
  // PUT /_synapse/admin/v2/users/<user_id>
  if (user_already_present == false){
    console.log("create user");
    await matrix_admin_api.put('/_synapse/admin/v2/users/' + user_id, {
            "password": Math.random().toString(36), // we will never use this, password login should be disabled
            "displayname": payload.user.name,
            "admin": false,
            "deactivated": false
      })
    .then(function (response) {
        console.log("user created");
        // console.log(response);
        //do we need something from the user?
    })
    .catch(function (error) {
        // handle error
        console.log(error);
    })
  }

  if (payload.rooms){
    asyncForEach(payload.rooms, async (room) => {
        let alias = room.type + "_" + room.id;
        var fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
        let room_matrix_id = await createRoom(fq_alias, alias, room.name, payload.school.name);

        //join user
       // note that we need to encode the #
        // await matrix_admin_api.post('/_synapse/admin/v1/join/' + fq_alias, {
        //     user_id: user_id
        // })
        // .then(function (response) {
        //     if (response.status == 200){
        //         console.log("user " + alias + " joined " + fq_alias);
        //     }
        // })
        // .catch(function (error) {
        //     console.log(error);
        //   }
        // )

        // check if exists and permissions levels are what we want
        var desiredUserPower = 0;
        if (room.announcements_only == true){
            desiredUserPower = 50;
        }
        // this can run async
        setRoomEventsDefault(room_matrix_id, desiredUserPower);
        setModerator(room_matrix_id, payload.user.id, room.is_moderator);

    });
  }

    // always join user (previous check can be implemented later)
    if (payload.school_has_allhands_channel) {
    //     let alias = "all_users_"+ school_id;
        let room_name = "Ankündigungen";
        let topic = "Ankündigungen der " + payload.school.name;
        let alias =  + "news_" + payload.school.id;
        var fq_alias = "%23" + alias + ":" + MATRIX_DOMAIN;
        var room_matrix_id = await createRoom(fq_alias, alias, room_name, school_name, topic);
        setRoomEventsDefault(room_matrix_id, 50);
        if (payload.user.is_school_admin) {
            setModerator(room_matrix_id, payload.user.id, true);
        }
     }else{
         //TODO: delete or block room if setting is changed
     }
};

// check if room exists, if not create
async function setRoomEventsDefault(room_matrix_id, events_default){
    var room_state = {};
    await matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels').then(function (response) {
        if (response.status == 200){
            room_state = response.data;
            // console.log(response.data);
        }
    })
    .catch(function (error) {
        console.log(error);
      }
    )
    if (room_state.events_default != events_default){
        room_state.events_default = events_default;
        await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
        .then(function (response) {
            // console.log(response.data);
        })
        .catch(function (error) {
            console.log(error);
        }
        )
    }
}

// returns room_matrix_id
async function createRoom(fq_alias, alias, room_name, school_name, topic = null){
    let room_already_present = false;
    console.log("check room " + fq_alias);
        await matrix_admin_api.get('/_matrix/client/r0/directory/room/' + fq_alias)
        .then(function (response) {
            if (response.status == 200){
                room_already_present = true;
                room_matrix_id = response.data.room_id;
                console.log("room " + room_matrix_id + " found");
            }
        })
        .catch(function (error) {
            console.log("room " + fq_alias + " not found");
        })
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
        return room_matrix_id;
}

async function setModerator(room_matrix_id, user_id, is_moderator){
    // check moderator
    await matrix_admin_api.get('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels').then(function (response) {
        if (response.status == 200){
            room_state = response.data;
            // console.log(response.data);
        }
    })
    .catch(function (error) {
        console.log(error);
    }
    )
    if (is_moderator) {
        if (!(room_state.users[user_id] && room_state.users[user_id] == 50)){
            room_state.users[user_id] = 50;
            await matrix_admin_api.put('/_matrix/client/r0/rooms/' + room_matrix_id + '/state/m.room.power_levels', room_state)
            .then(function (response) {
                console.log(response.data);
            })
            .catch(function (error) {
                console.log(error);
            }
            )
        }else{
            console.log("user is already a moderator");
        }
        //TODO: Delete moderator if valiue is false
    }else if (room_state.users[user_id] && room_state.users[user_id] == 50){
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