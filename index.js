
// {
//     school_id: 1223435,
//     school_has_allhands_channel : true,
//      user: {
//       id: 1234566@matrix.schul-cloud.org,
//       name: "Joe Cool",
//       is_school_admin: true
//     },
//     rooms:[
//         {
//             id: 1234566,
//             name: 'Mathe 6b',
//             type: 'course',
//             is_moderator: true //must be mapped https://matrix.org/docs/guides/moderation#power-levels
//         },
//         ...
//     ]
// }

var amqp = require('amqplib/callback_api');
var fs = require('fs');

const MATRXI_BASE_URL = "https://matrix.stomt.com"; //without trailing slash
const axios = require('axios');
// read token from file, should be moved to ENv or secrets for prod
var admin_token = fs.readFileSync('token','utf8');

const matrix_admin_api = axios.create({
    baseURL: MATRXI_BASE_URL,
    timeout: 10000,
    headers: {'Authorization': 'Bearer '+ admin_token}
  });
// --header "Authorization: Bearer <access_token>"
// this can be localhost, in production we can take care of 
// forwarding the ports to all containers
amqp.connect('amqp://localhost', function(error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function(error1, channel) {
    if (error1) {
      throw error1;
    }
    var queue = 'matrix_sync_populated';

    channel.assertQueue(queue, {
      durable: false
    });

    console.log(" [*] Waiting for messages in %s.", queue);

    channel.consume(queue, function(msg) {
        console.log(" [x] Received %s", msg.content.toString());
        this.syncUserWithMatrix(msg.content);
    }, {
        noAck: true
    });
  });
});
//dev and test stuff

function syncUserWithMatrix(payload){

  let default_room_params = {};
  let user_id = payload.user.id;
  let user_already_present = false;
  // check if user exists
  // GET /_synapse/admin/v2/users/<user_id>
  matrix_admin_api.get('/_synapse/admin/v2/users/'+user_id)
    .then(function (response) {
        if (response.status == 200){
            user_already_present = true;
        }
        //do we need something from the user?
    })
    .catch(function (error) {
        // handle error
        console.log(error);
    }
    // .finally(function () {
    //     // always executed
    // }
  );

  // PUT /_synapse/admin/v2/users/<user_id>
  if (user_already_present === false){
    matrix_admin_api.put('/_synapse/admin/v2/users/'+user_id, {
            "password": Math.random().toString(36), // we will never use this, password login should be disabled
            "displayname": payload.user.name,
            "admin": false,
            "deactivated": false
      })
    .then(function (response) {
        console.log(response);
        if (response.status == 200){
            user_already_present = true;
        }
        //do we need something from the user?
    })
  }
    //   {
    //     "password": "", // random if its ever used
    //     "displayname": "User",
    //     "admin": false,
    //     "deactivated": false
    // }
    // for each room
    // build id 
    // build alis
    let alias = room.type + "_"+ room.id;
    // check if exists and permissions levels are what we wanr
    // GET /_matrix/client/r0/directory/room/{roomAlias}
    // throws 404 if not exists
    // add if not exists
    // POST /_matrix/client/r0/createRoom
    // else if permission_not-up2date
    // update room settings
    // maybe add cache here later
    // always join user (previous check can be implemented later)
    // requires https://github.com/matrix-org/synapse/pull/7051
    // POST /_synapse/admin/v1/join/<roomIdOrAlias></roomIdOrAlias>
    if (payload.school_has_allhands_channel) {
        let alias = "all_users_"+ school_id;
        let room_name = "Schulhof"
        // check if exists
        // GET /_matrix/client/r0/directory/room/{roomAlias}
        // throws 404 if not exists
        // add if not exists
        // POST /_matrix/client/r0/createRoom
        // maybe add cache here later
        // always join user (previous check can be implemented later)
        // requires https://github.com/matrix-org/synapse/pull/7051
        // POST /_synapse/admin/v1/join/<roomIdOrAlias></roomIdOrAlias>
    }


}
