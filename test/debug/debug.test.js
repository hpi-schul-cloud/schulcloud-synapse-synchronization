const {
  describe, it,
} = require('mocha');
const syncer = require('../../src/syncer');

describe('debug', function desc() {
  this.timeout(10000);

  describe('syncRoom', () => {
    it('full room', async () => {
      const alias = '$test_id';
      const topic = 'topic';
      const name = 'name2';

      const room_state = await syncer.syncRoom(alias, name, topic);

      const user_id = '';
      await syncer.syncRoomMember(room_state, user_id, 50);
    });
  });

  it('deleteRoom', () => syncer.deleteRoom(''));

  it('kickUser', () => syncer.kickUser('', '', ''));

  it('getRooms', async () => {
    const rooms = await syncer.getRooms();
    console.log(rooms);
  });
});
