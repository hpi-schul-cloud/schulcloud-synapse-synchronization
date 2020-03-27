'use strict';

const assert = require('assert');
const syncer = require('./../../src/syncer');

describe('syncer', function () {
  before(function (done) {
    done();
  });

  after(function (done) {
    done();
  });

  it('syncUserWithMatrix', function () {
    const message = {
      "method": "adduser",
      "school": {"id": "0000d186816abba584714c5f", "has_allhands_channel": true, "name": "Paul-Gerhardt-Gymnasium "},
      "user": {"id": "@sso_0000d213816abba584714c0a:matrix.stomt.com", "name": "Thorsten Test", "email": "admin@schul-cloud.org", "is_school_admin": true, "is_school_teacher": false},
      "rooms": [{"id": "0000dcfbfb5c7a3f00bf21ab", "name": "Mathe", "type": "course", "bidirectional": false, "is_moderator": false}]
    };

    return syncer
      .syncUserWithMatrix(message);
  });
});
