const listener = require('./src/listener');
const syncer = require('./src/syncer');
const pack = require('./package.json');

// SETUP
console.log(`Running version ${pack.version}`);
syncer.setupSyncUser()
  .then(() => console.log('setupSyncUser completed.'))
  .catch(() => console.log('setupSyncUser failed.'))

  // LISTEN
  .then(() => listener.listen());
