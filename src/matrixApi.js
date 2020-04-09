const {Configuration} = require('@schul-cloud/commons');
const axios = require('axios');
const authToken = require('./authToken');

const MATRIX_URI = Configuration.get('MATRIX_URI');

// SETUP API
const axios_matrix_admin_api = axios.create({
  baseURL: MATRIX_URI,
  timeout: 10000,
});

const matrix_admin_api = {
  get: (first, second, third = null) => call('get', first, second, third),
  put: (first, second, third) => call('put', first, second, third),
  post: (first, second, third) => call('post', first, second, third),
};

function call(func, first, second, third) {
  return authToken
    .getSyncUserToken()
    .then((syncUserToken) => {
      axios_matrix_admin_api.defaults.headers.common.Authorization = `Bearer ${syncUserToken}`;

      return axios_matrix_admin_api[func](first, second, third)
        .catch(async (error) => {
          if (error.response && error.response.status === 429) {
            const timeToWait = error.response.data.retry_after_ms + 100;
            console.warn(`Waiting for ${timeToWait}ms...`);
            await sleep(timeToWait);
            return matrix_admin_api[func](first, second, third);
          }
          throw error;
        });
    });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


module.exports = matrix_admin_api;
