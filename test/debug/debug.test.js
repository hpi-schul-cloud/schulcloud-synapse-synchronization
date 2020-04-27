const {
  after, before, describe, it,
} = require('mocha');
const syncer = require('../../src/syncer');

describe('debug', () => {

  describe('syncRoom', () => {

    it('full room', async () => {
      const alias = `$test_id`;
      const topic = 'topic';
      const name = 'name2';

      const room_state = await syncer.syncRoom(alias, name, topic);

      const user_id = '@sso_838e0b00-41d1-4768-bcb5-471898f5bae9:matrix.stomt.com';
      await syncer.syncRoomMember(room_state, user_id, 50);
    });

  });

});
