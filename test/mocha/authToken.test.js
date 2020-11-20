const { Configuration } = require('@hpi-schul-cloud/commons');
const {
  after, before, describe, it,
} = require('mocha');
const assert = require('assert');

const nock = require('nock');
const authToken = require('../../src/authToken');

const MATRIX_URI = Configuration.get('MATRIX_MESSENGER__URI');
const MATRIX_SERVERNAME = Configuration.get('MATRIX_MESSENGER__SERVERNAME');
const MATRIX_SYNC_USER_NAME = Configuration.get('MATRIX_MESSENGER__SYNC_USER_NAME');

describe('authToken', () => {
  let scope;

  before((done) => {
    scope = nock(MATRIX_URI);
    done();
  });

  after((done) => {
    if (!scope.isDone()) {
      console.error('pending mocks: %j', scope.pendingMocks());
    }
    done();
  });

  describe('obtainAccessToken', () => {
    it('for user', () => {
      scope
        .post('/_matrix/client/r0/login')
        .reply(200, {
          access_token: 'randomToken',
        });

      return authToken
        .obtainAccessToken('@user:server.domain', MATRIX_URI, 'SECRET')
        .then((authObj) => {
          assert.ok(authObj);
          assert.ok(authObj.homeserverUrl);
          assert.ok(authObj.userId);
          assert.ok(authObj.accessToken);
          assert.ok(authObj.accessToken === 'randomToken');
        });
    });
  });

  describe('getSyncUserToken', () => {
    it('based on password', () => {
      Configuration.set('MATRIX_MESSENGER__SYNC_USER_PASSWORD', 'password');
      scope
        .post('/_matrix/client/r0/login', {
          type: 'm.login.password',
          user: `@${MATRIX_SYNC_USER_NAME}:${MATRIX_SERVERNAME}`,
          password: 'password',
        })
        .reply(200, JSON.stringify({
          access_token: 'randomToken',
        }));

      return authToken
        .getSyncUserToken()
        .then((accessToken) => {
          assert.ok(accessToken);
          assert.ok(accessToken === 'randomToken');
          authToken.clearCache();
        });
    });

    it('based on secret', () => {
      scope
        .post('/_matrix/client/r0/login')
        .reply(200, JSON.stringify({
          access_token: 'randomToken',
        }));

      return authToken
        .getSyncUserToken()
        .then((accessToken) => {
          assert.ok(accessToken);
          assert.ok(accessToken === 'randomToken');
          authToken.clearCache();
        });
    });

    it('second time cached', () => {
      scope
        .post('/_matrix/client/r0/login')
        .reply(200, JSON.stringify({
          access_token: 'randomToken',
        }));

      return authToken
        .getSyncUserToken()
        .then((accessToken) => {
          // first return from request
          assert.ok(accessToken);
          assert.ok(accessToken === 'randomToken');

          return authToken
            .getSyncUserToken()
            .then((accessToken2) => {
              // second return cached
              assert.ok(accessToken2);
              assert.ok(accessToken2 === 'randomToken');
              authToken.clearCache();
            });
        });
    });

    it('avoid parallel requests', () => {
      scope
        .post('/_matrix/client/r0/login')
        .reply(200, JSON.stringify({
          access_token: 'randomToken',
        }));

      return Promise
        .all([
          authToken
            .getSyncUserToken()
            .then((accessToken) => {
              // second return cached
              assert.ok(accessToken);
              assert.ok(accessToken === 'randomToken');
            }),
          authToken
            .getSyncUserToken()
            .then((accessToken) => {
              // second return cached
              assert.ok(accessToken);
              assert.ok(accessToken === 'randomToken');
            }),
        ])
        .then(() => {
          authToken.clearCache();
        });
    });

    it('from configuration', () => {
      Configuration.set('MATRIX_MESSENGER__SYNC_USER_TOKEN', 'syncToken');

      return authToken
        .getSyncUserToken()
        .then((accessToken) => {
          assert.ok(accessToken);
          assert.ok(accessToken === 'syncToken');
        });
    });
  });
});
