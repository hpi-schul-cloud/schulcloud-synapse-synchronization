const {
  describe, it,
} = require('mocha');
const syncer = require('../../src/syncer');
// const matrix_admin_api = require('../../src/matrixApi');

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

  it('getOrCreateUser', () => syncer.getOrCreateUser({id: '@sso_:test.messenger.schule', name: 'Test Sync'}));

  it('getUsers', async () => {
    const users = await syncer.getUsers();
    console.log(users);
  });

  it('deactivateUser', () => syncer.deactivateUser({id: '@user:test.messenger.schule'}));

  it('getRooms', async () => {
    const rooms = await syncer.getRooms();
    console.log(rooms);
  });

  it('private Message', async () => {
    const welcomeMessage = 'Hi\nHow are you?';

    // create private room
    const alias = 'test_room11';
    const room_id = await syncer.syncDirectRoom(alias, 'Test Message', '', [''], true);

    // send welcome message
    const message = {
      msgtype: 'm.text',
      body: welcomeMessage,
    };
    return syncer.sendMessage(room_id, message);
  });
});
