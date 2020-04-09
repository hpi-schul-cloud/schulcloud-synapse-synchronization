const {Configuration} = require('@schul-cloud/commons');
const hmacSHA512 = require('crypto-js/hmac-sha512');
const axios = require('axios');

let cached_sync_user_token = null;

module.exports = {
  obtainAccessToken,
  getSyncUserToken,
  clearCache,
};

function clearCache() {
  cached_sync_user_token = null;
}

function obtainAccessToken(userId, homeserverApiUri, secret) {
  const loginApiUrl = `${homeserverApiUri}/_matrix/client/r0/login`;

  const password = hmacSHA512(userId, secret).toString();

  const payload = {
    type: 'm.login.password',
    user: userId,
    password,
  };

  return axios.post(loginApiUrl, payload)
    .then((response) => response.data)
    .then((data) => ({
      userId,
      homeserverUrl: homeserverApiUri,
      accessToken: data.access_token,
    }));
}

function getSyncUserToken() {
  const configured_sync_user_token = Configuration.get('MATRIX_SYNC_USER_TOKEN');

  if (configured_sync_user_token) {
    return Promise.resolve(configured_sync_user_token);
  }

  if (cached_sync_user_token) {
    return Promise.resolve(cached_sync_user_token);
  }

  const username = Configuration.get('MATRIX_SYNC_USER_NAME');
  const servername = Configuration.get('MATRIX_SERVERNAME');
  const matrixId = `@${username}:${servername}`;
  const matrixUri = Configuration.get('MATRIX_URI');
  const matrixSecret = Configuration.get('MATRIX_SECRET');

  cached_sync_user_token = obtainAccessToken(matrixId, matrixUri, matrixSecret)
    .then((authObject) => authObject.accessToken);

  return cached_sync_user_token;
}
