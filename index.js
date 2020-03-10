
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

function syncUserWithMatrix(payload){

  let default_room_params = {};

  // check if user exists
  // GET /_synapse/admin/v2/users/<user_id>
  // if not create
  // PUT /_synapse/admin/v2/users/<user_id>
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
