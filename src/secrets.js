
function getSecrets() {
  if (['production'].includes(process.env.NODE_ENV)) {
    return require('./../config/secrets.js');
  } else {
    return require('./../config/secrets.json');
  }
}

module.exports = getSecrets();
