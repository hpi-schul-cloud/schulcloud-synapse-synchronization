# HPI Schul-Cloud Synapse Synchronization

This is for handling an incoming object that describes a user, his desired channel
and permissions and then takes care of syncing this to the defined synapse server.
The synchronization is unidirectional, changes on the matrix server are not
propagated back to the Schul-Cloud.

The code is based on: https://github.com/matrix-org/matrix-appservice-node

Creation of users see: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst

## Configuration

Configure the variables defined in `/config/default.schema.json` in a local `.env` file:
`cp .env.sample .env` or by specifying them as process environment variables.

To generate a valid access token for your sync user execute the following command
with your `<userid>`, `<password>` and `<matrixuri>`:

```bash
curl -XPOST \
  -d '{"type":"m.login.password", "user":"<userid>", "password":"<password>"}' \
  "<matrixuri>/_matrix/client/r0/login"
```

## Logic

### 1. Receives incoming request with payload like this:

```json
{
    "method": "adduser",
    "school": {
      "id": "0000d186816abba584714c5f",
      "has_allhands_channel": true,
      "name": "Paul-Gerhardt-Gymnasium",
    },
    "user": {
      "id": "@sso_0000d224816abba584714c9c:matrix.server.com",
      "name": "Marla Mathe",
      "email": "schueler@schul-cloud.org",
      "is_school_admin": false,
      "is_school_teacher": false
    },
    "rooms": [
      {
        "id": "0000dcfbfb5c7a3f00bf21ab",
        "name": "Mathe",
        "type": "course",
        "bidirectional": false,
        "is_moderator": false
      },
      {
        "id": "5e1dba1eaa30ab4df47e11d2",
        "name": "Test Team",
        "type": "team",
        "bidirectional": false,
        "is_moderator": false
      }
    ]
  }
```

### 2. Sync

- Check if user exits, if not create him.
- Get all managed rooms by this user.
- For all rooms where the user is not in: Check if room exists (if not create), add user to room. If user is in room update power level if requested power level is higher than current one.

Right now we should not kick out users of rooms they are in, because they can be added to new rooms via the chat interface.
We also do not lower the users power level in a sync.


## Open Questions:

- https://github.com/matrix-org/synapse/pull/7051
- TODO: Globale Lehrerzimmer: How to ensure invites are not resent to often -> we can not know if user already received invite and declined -> move to dedicated function?

## Container

### Build

To build a default container image run the following code:
```
make build
```

To customize the build process set some environment variables (details see
Makefile). For example set `DOCKER_IMAGE_TAG` to build a custom image tag:
```
make build DOCKER_IMAGE_TAG="foo/bar:latest"
```

### Push

To push a previously built default container image run the following code:
```
make push
```

**Todo: Currently private credentials (username, password) will be used for
`docker login` (see `~/.docker/config.json`). This should be made configurable
later for CI pipelines.**

To customize the push process set some environment variables (details see
Makefile). For example set `DOCKER_IMAGE_TAG` to push a custom image tag:
```
make push DOCKER_IMAGE_TAG="foo/bar:latest"
```
