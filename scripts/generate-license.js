/**
 * License Key Generator (Developer-only tool)
 * 
 * Usage: node scripts/generate-license.js "User Name" "user@email.com"
 * 
 * First run: generates a keypair (private.pem + public.pem) in this directory.
 * Subsequent runs: signs the payload with the existing private key.
 * 
 * IMPORTANT: Replace the LICENSE_PUBLIC_KEY in src/index.js with the contents of public.pem
 * after frist run.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = path.join(__dirname, 'private.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'public.pem');

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

  console.log('Generated new keypair.');
  console.log('Public key saved to:', PUBLIC_KEY_PATH);
  console.log('Private key saved to:', PRIVATE_KEY_PATH);
  console.log('\n*** Copy the contents of public.pem into LICENSE_PUBLIC_KEY in src/index.js ***\n');

  return privateKey;
}

function generateLicense(name, email) {
  let privateKey;

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  } else {
    privateKey = generateKeyPair();
  }

  const payload = JSON.stringify({ name, email });
  const payloadBase64 = Buffer.from(payload).toString('base64');

  const signer = crypto.createSign('SHA256');
  signer.update(payload);
  signer.end();

  const signature = signer.sign(privateKey);
  const signatureBase64 = signature.toString('base64');

  const licenseKey = payloadBase64 + '.' + signatureBase64;

  console.log('License generated for:', name, '<' + email + '>');
  console.log('\n--- LICENSE KEY ---');
  console.log(licenseKey);
  console.log('--- END ---\n');

  return licenseKey;
}

// CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node generate-license.js "User Name" "user@email.com"');
  process.exit(1);
}

generateLicense(args[0], args[1]);
