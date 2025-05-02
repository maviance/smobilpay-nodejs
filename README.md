# s3p-signature-nodejs

Node.js implementation of the Smobilpay S3P HMAC-SHA1 signature generator.

## Features

- OAuth-style canonical string generation
- HMAC-SHA1 with Base64 output
- Works for GET and POST
- Compatible with Smobilpay API requirements

## Installation

```bash
npm install
```

## Usage

### POST Example

```bash
node examples/post.js
```

### GET Example

```bash
node examples/get.js
```

## Testing

```bash
npm test
```

## License

MIT © 2025 Maviance PLC
