const crypto = require('crypto');

function percentEncode(str) {
  return encodeURIComponent(str).replace(/\+/g, '%20');
}

function buildBaseString(method, url, params) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${k}=${params[k]}`).join('&');

  return [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString)
  ].join('&');
}

function generateS3PSignature({ method, url, params, secret }) {
  const baseString = buildBaseString(method, url, params);
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(baseString);
  return hmac.digest('base64');
}

module.exports = {
  generateS3PSignature
};
