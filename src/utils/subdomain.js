const crypto = require('crypto');
const RESERVED = ['www', 'api', 'admin', 'app', 'mail', 'email', 'webmail', 'smtp', 'imap', 'pop', 'ftp', 'ns1', 'ns2', 'dashboard', 'auth', 'login', 'logout', 'register', 'signup', 'onboarding', 'verify', 'school', 'schools', 'student', 'students', 'teacher', 'teachers', 'parent', 'parents', 'super', 'superadmin', 'support', 'help', 'status', 'blog', 'docs', 'static', 'assets', 'cdn', 'edunova', 'portal', 'billing', 'payment', 'payments', 'subscription', 'demo', 'test', 'staging', 'dev'];
const slugify = (name) => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
const isReserved = (s) => RESERVED.includes(s);
// db can be the pool or a transaction client
const uniqueSubdomain = async (db, base) => {
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const r = await db.query('SELECT 1 FROM schools WHERE lower(subdomain)=$1 LIMIT 1', [candidate]);
    if (!r.rowCount) return candidate;
    candidate = base.slice(0, 36) + '-' + i;
  }
  return base.slice(0, 30) + '-' + crypto.randomBytes(3).toString('hex');
};
module.exports = { slugify, isReserved, uniqueSubdomain, RESERVED };
