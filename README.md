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
    "MATRIX_MESSENGER": {
      "type": "object",
      "description": "Matrix messenger properties, required always to be defined",
      "required": [
        "URI",
        "SERVERNAME"
      ],
      "properties": {
        "URI": {
          "type": "string",
          "format": "uri",
          "description": "The URI of the Matrix Messenger server."
        },
        "SERVERNAME": {
          "type": "string",
          "description": "Servername of the Matrix Messenger server."
        },
        "SECRET": {
          "type": "string",
          "description": "Shared secret for the Matrix server."
        },
        "SYNC_USER_NAME": {
          "type": "string",
          "default": "sync",
          "description": "Name of admin user to manage the server."
        },
        "SYNC_USER_PASSWORD": {
          "type": "string",
          "description": "Shared secret for the Matrix server to generate access tokens. (optional - if MATRIX_SYNC_USER_TOKEN or MATRIX_SECRET are set)"
        },
        "SYNC_USER_TOKEN": {
          "type": "string",
          "description": "AccessToken of synchronization user which. (optional - if MATRIX_SYNC_USER_PASSWORD or MATRIX_SECRET are set)"
        },
        "SYNC_USER_DISPLAYNAME": {
          "type": "string",
          "default": "Sync-Bot",
          "description": "Define a custom displayname to be set for the sync user"
        },
        "SYNC_USER_AVATAR_PATH": {
          "type": "string",
          "default": "./data/avatar.png",
          "description": "Upload a custom avatar for the sync user"
        }
      }
    },
    "RABBITMQ_URI": {
      "type": "string",
      "format": "uri",
      "pattern": ".*(?<!/)$",
      "default": "amqp://localhost",
      "description": "The URI of the RabbitMQ / AMQP server"
    },
    "RABBITMQ_MATRIX_QUEUE_EXTERNAL": {
      "type": "string",
      "default": "matrix_sync_populated",
      "description": "The name of the RabbitMQ channel we listen to"
    }
  }
}
```

To authenticate the `MATRIX_MESSENGER__SYNC_USER_NAME` against the synapse server, different authorization methods can be used.
By configuring `MATRIX_MESSENGER__SYNC_USER_PASSWORD` a simple password login is done.
Instead the accesstoken `MATRIX_MESSENGER__SYNC_USER_TOKEN` can be passed directly (eg. if password login is disabled on the server).
If the [Shared Secret Authenticator Module](https://github.com/devture/matrix-synapse-shared-secret-auth) is used
the corresponding `MATRIX_MESSENGER__SECRET` can be used instead.

## Logic

### 1. Receives incoming request with payload like this:

```json
{
  "method": "addUser",
  "welcome": {
    "text": "(optional, can contain html links and formatting)"
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
  "method": "removeUser",
  "user": {
    "id": "@someId:matrix.server.com",
  }
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

## Release

To release this project first [choose the next version number](https://semver.org/), it will be in the formatt `X.Y.Z`.
In the following replace X.Y.Z with the version you chose.

1. Create a new Release branch
    ```
    git checkout -b release/X.Y.Z
    ```

1. Add a headline (`## [X.Y.Z]`) for the new version in the Changelog below the Unreleased headline

1. Update the version in both `package.json` and `package-lock.json`

1. Commit your changes
    ```
    git commit -am 'bump version to X.Y.Z'
    ```

1. Tag the new version
    ```
    git tag -a X.Y.Z
    ```

1. Merge the release
    ```
    git checkout master
    git merge release/2.0.0
    git checkout develop
    git merge master
    ```

1. Cleanup
    ```
    git branch -d release/2.0.0
    ```

1. Push your changes
    ```
    git push origin master develop --tags
    ```
