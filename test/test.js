const assert = require('assert');
const { generateS3PSignature } = require('../lib/s3p-signature');

describe('S3P Signature Generator', function () {
  it('should generate correct signature for POST', function () {
    const signature = generateS3PSignature({
      method: 'POST',
      url: 'https://dev.smobilpay.com/s3p/v2/quotestd',
      secret: 'MySecretKey',
      params: {
        amount: '1000',
        payItemId: 'SPAY-DEV-958-AES-100013333-10010',
        s3pAuth_nonce: '634968823463411609',
        s3pAuth_signature_method: 'HMAC-SHA1',
        s3pAuth_timestamp: '1361281946',
        s3pAuth_token: 'xvz1evFS4wEEPTGEFPHBog'
      }
    });

    assert.strictEqual(signature, '1CLm+TQLwelkE+5Za+Vi+7G5M8U=');
  });

  it('should generate correct signature for GET', function () {
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

    assert.strictEqual(signature, 'wff4LW5sueJe0K4Uzk7fHrjElGk=');
  });
});