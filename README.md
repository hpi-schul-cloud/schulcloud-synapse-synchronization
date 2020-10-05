# HPI Schul-Cloud Synapse Synchronization

This is for handling an incoming object that describes a user, his desired channel
and permissions and then takes care of syncing this to the defined synapse server.
The synchronization is unidirectional, changes on the matrix server are not
propagated back to the HPI Schul-Cloud.

The code is based on: https://github.com/matrix-org/matrix-appservice-node

Creation of users see: https://github.com/matrix-org/synapse/blob/master/docs/admin_api/user_admin_api.rst

## Configuration

Configure the variables defined in `/config/default.schema.json` in a local `.env` file:
`cp .env.sample .env` or by specifying them as process environment variables.

The following variables are available (`config/default.schema.json`):

```json
{
  "title": "Synapse Synchronization Configuration",
  "type": "object",
  "properties": {
    "MATRIX_URI": {
      "type": "string",
      "format": "uri",
      "description": "The URI of the matrix server"
    },
    "MATRIX_SERVERNAME": {
      "type": "string",
      "description": "The name of the matrix server"
    },
    "MATRIX_SYNC_USER_NAME": {
      "type": "string",
      "default": "sync",
      "description": "Name of admin user to manage the server."
    },
    "MATRIX_SYNC_USER_PASSWORD": {
      "type": "string",
      "description": "Shared secret for the Matrix server to generate access tokens. (optional - if MATRIX_SYNC_USER_TOKEN or MATRIX_SECRET are set)"
    },
    "MATRIX_SYNC_USER_TOKEN": {
      "type": "string",
      "description": "AccessToken of synchronization user which. (optional - if MATRIX_SYNC_USER_PASSWORD or MATRIX_SECRET are set)"
    },
    "MATRIX_SECRET": {
      "type": "string",
      "description": "Shared secret for the Matrix server to generate access tokens. (optional - if MATRIX_SYNC_USER_PASSWORD or MATRIX_SYNC_USER_TOKEN are set)"
    },
    "MATRIX_SYNC_USER_DISPLAYNAME": {
      "type": "string",
      "default": "Sync-Bot",
      "description": "Define a custom displayname to be set for the sync user"
    },
    "MATRIX_SYNC_USER_AVATAR_PATH": {
      "type": "string",
      "pattern": ".*png$",
      "default": "./data/avatar.png",
      "description": "Upload a custom avatar for the sync user"
    },
    "RABBITMQ_URI": {
      "type": "string",
      "format": "uri",
      "pattern": ".*(?<!/)$",
      "default": "amqp://localhost",
      "description": "The URI of the RabbitMQ / AMQP server"
    },
    "RABBIT_MQ_QUEUE": {
      "type": "string",
      "default": "matrix_sync_populated",
      "description": "The name of the RabbitMQ channel we listen to"
    }
  },
  "required": [
    "MATRIX_URI",
    "MATRIX_SERVERNAME",
    "MATRIX_SYNC_USER_NAME",
    "MATRIX_SYNC_USER_DISPLAYNAME",
    "MATRIX_SYNC_USER_AVATAR_PATH",
    "RABBITMQ_URI",
    "RABBIT_MQ_QUEUE"
  ]
}
```

To authenticate the `MATRIX_SYNC_USER_NAME` against the synapse server, different authorization methods can be used.
By configuring `MATRIX_SYNC_USER_PASSWORD` a simple password login is done.
Instead the accesstoken `MATRIX_SYNC_USER_TOKEN` can be passed directly (eg. if password login is disabled on the server).
If the [Shared Secret Authenticator Module](https://github.com/devture/matrix-synapse-shared-secret-auth) is used
the corresponding `MATRIX_SECRET` can be used instead.

## Logic

### 1. Receives incoming request with payload like this:

```json
{
  "method": "addUser",
  "welcome": {
    "text": "Welcome to messenger"
  },
  "user": {
    "id": "@someId:matrix.server.com",
    "name": "Firstname Lastname",
    "email": "(optional)",
    "password": "(optional)"
  },
  "rooms": [
    {
      "type": "(optional, default: 'room')",
      "id": "Ab01234",
      "name": "Room Name",
      "description": "(optional)",
      "bidirectional": "(optional, default: false)",
      "is_moderator": "(optional, default: false)"
    }
  ]
}
```

```json
{
  "method": "addRoom",
  "room": {
    "type": "(optional, default: 'room')",
    "id": "Ab01234",
    "name": "Room Name",
    "description": "(optional)",
    "bidirectional": "(optional, default: false)"
  },
  "members": [
    {
      "id": "@someId:matrix.server.com",
      "is_moderator": "(optional, default: false)"
    }
  ]
}
```

```json
{
  "method": "removeRoom",
  "room": {
    "type": "(optional, default: 'room')",
    "id": "Ab01234"
  }
}
```

### 2. Sync

- Check if user exits, if not create him.
- Get all managed rooms by this user.
- For all rooms where the user is not in: Check if room exists (if not create), add user to room. If user is in room update power level if requested power level is higher than current one.

Right now we should not kick out users of rooms they are in, because they can be added to new rooms via the chat interface.
We also do not lower the users power level in a sync.

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
