# synapse-application-service

This is for handling an imcoming  object that describes a user, his desired channel and permissions and then takes care of syncing this to the defined matrix server.

Maybe we do not need a full application as right now this is no bidirectional. If not this will just be a small microserver or later some serverless code


This is based on: https://github.com/matrix-org/matrix-appservice-node

Creation of users see: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst

Logic:

1. Receives incomming request with payload like this:

```
{ 
    school_id: 1223435,
    school_has_allhands_channel: true,
    user: {
        id: 1234566@matrix.schul-cloud.org,
        name: "Joe Cool"",
        is_school_admin: true
    },
    rooms:[
        {
            id: 1234566,
            name: 'Mathe 6b',
            permission: read
        },
        ...
    ]
}
```

2. Sync

- Check if user exits, if not create him
- Get all managed rooms by this user.
- For all rooms where the user is not in: Check if room exists (if not create), add user to room. If user is in room update power level if requetsed power level is higher than current one.

Right now we should not kick out users of rooms they are in,a s you mijght add users within the chat. We alse shoudl never lower the power user room level per sync.


Open Questions:

- How to create room? 
- How to identify room: proposal: scopename_scopeid (team_3453456456) als alias

https://matrix.org/docs/spec/application_service/r0.1.2#identity-assertion

https://github.com/matrix-org/synapse/pull/7051
