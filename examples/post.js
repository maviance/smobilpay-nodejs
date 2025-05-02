const { generateS3PSignature } = require('../lib/s3p-signature');

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

console.log('POST Signature:', signature);
// Expected: 1CLm+TQLwelkE+5Za+Vi+7G5M8U=