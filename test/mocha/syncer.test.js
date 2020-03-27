'use strict';

const {Configuration} = require('@schul-cloud/commons');
const {after, before, describe, it} = require("mocha");
const assert = require('assert');

const syncer = require('./../../src/syncer');
const nock = require('nock');

const MATRIX_URI = Configuration.get('MATRIX_URI');

describe('syncer', () => {

  let scope;

  before((done) => {
    scope = nock(MATRIX_URI);
    done();
  });

  after((done) => {
    if (!scope.isDone()) {
      console.error('pending mocks: %j', scope.pendingMocks())
    }
    done();
  });

  describe('getOrCreateUser', () => {
    it('user exists', () => {
      scope
        .get('/_synapse/admin/v2/users/test_id')
        .reply(200, {});

      const user = {
        id: 'test_id',
        name: 'test user',
        email: 'test@test.com',
      };
      return syncer.getOrCreateUser(user)
    });
    it('create user', () => {
      scope
        .get('/_synapse/admin/v2/users/test_id')
        .reply(404, {});
      scope
        .put('/_synapse/admin/v2/users/test_id')
        .reply(200, {});

      const user = {
        id: 'test_id',
        name: 'test user',
        email: 'test@test.com',
      };
      return syncer.getOrCreateUser(user)
    });
  });

  describe('createUser', () => {
    it('user exists', () => {
      scope
        .put('/_synapse/admin/v2/users/test_id')
        .reply(400, {});

      const user = {
        id: 'test_id',
        name: 'test user',
        email: 'test@test.com',
      };

      return syncer.createUser(user)
        .catch(() => {
          return true;
        });
    });
    it('create user', () => {
      scope
        .put('/_synapse/admin/v2/users/test_id')
        .reply(200, {});

      const user = {
        id: 'test_id',
        name: 'test user',
        email: 'test@test.com',
      };
      return syncer.createUser(user)
    });
  });

});
