const { generateS3PSignature } = require('../lib/s3p-signature');

const signature = generateS3PSignature({
  method: 'GET',
  url: 'https://dev.smobilpay.com/s3p/v2/bill',
  secret: 'MySecretKey',
  params: {
    serviceNumber: 'TestId',
    merchant: 'TESTMERC',
    serviceid: '99999',
    s3pAuth_nonce: '634968823463411611',
    s3pAuth_signature_method: 'HMAC-SHA1',
    s3pAuth_timestamp: '1361281946',
    s3pAuth_token: 'xvz1evFS4wEEPTGEFPHBog'
  }
});

console.log('GET Signature:', signature);
// Expected: wff4LW5sueJe0K4Uzk7fHrjElGk=