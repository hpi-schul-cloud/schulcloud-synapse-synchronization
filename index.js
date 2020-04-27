const listener = require('./src/listener');
const syncer = require('./src/syncer');

syncer.setupSyncUser();
listener.listen();
