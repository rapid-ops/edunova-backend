const crypto = require('crypto');
const key = () => crypto.createHash('sha256').update('edunova-signup-code:' + (process.env.JWT_SECRET || '')).digest();
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (email, code) => crypto.createHmac('sha256', key()).update(String(email).trim().toLowerCase() + ':' + String(code)).digest('hex');
const codeMatches = (email, code, hash) => {
  const a = Buffer.from(hashCode(email, code), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
module.exports = { newCode, hashCode, codeMatches };
