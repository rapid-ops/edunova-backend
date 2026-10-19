require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');
const B = 'https://edunova-backend-2x7h.onrender.com/api';
const MAIL = (process.env.MAIL || '').trim().toLowerCase();
const MODE = process.env.MODE || 'auto';
const NAME = 'RESET TEST DELETE ME';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const post = async (p, b) => {
  const t0 = Date.now();
  const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j, ms: Date.now() - t0 };
};
const show = (l, r) => console.log(l, r.s, JSON.stringify(r.j).slice(0, 100), r.ms + 'ms');
(async () => {
  if (!MAIL.includes('@')) return console.log('Set MAIL=address');
  if (MODE === 'clean') {
    const d = await pool.query('DELETE FROM users WHERE lower(email)=$1 AND full_name=$2 RETURNING id', [MAIL, NAME]);
    return console.log('deleted rows:', d.rowCount);
  }
  const ex = await pool.query('SELECT id FROM users WHERE lower(email)=$1', [MAIL]);
  if (ex.rows[0]) return console.log('Email already exists, aborting. Use another address.');
  const hp = await bcrypt.hash('OldPass123', 10);
  const u = (await pool.query("INSERT INTO users (school_id, full_name, email, password, role) VALUES (4, $1, $2, $3, 'student') RETURNING id", [NAME, MAIL, hp])).rows[0];
  try {
    const k = await post('/auth/forgot-password', { email: MAIL });
    const n = await post('/auth/forgot-password', { email: 'nobody-' + Date.now() + '@example.com' });
    show('request known  ', k); show('request unknown', n);
    console.log('same status and body:', k.s === n.s && JSON.stringify(k.j) === JSON.stringify(n.j));
    const row = (await pool.query('SELECT length(reset_token) AS len, reset_token_expires - NOW() AS left FROM users WHERE id=$1', [u.id])).rows[0];
    console.log('stored hash length:', row.len, '| expires in:', JSON.stringify(row.left));
    if (MODE === 'mail') return console.log('User kept. Open the email, set a new password, log in, then run MODE=clean.');
    const setTok = async (iv) => { const raw = crypto.randomBytes(32).toString('hex'); await pool.query('UPDATE users SET reset_token=$1, reset_token_expires=NOW() + $2::interval WHERE id=$3', [sha(raw), iv, u.id]); return raw; };
    let raw = await setTok('1 hour');
    show('validate good   ', await post('/auth/reset-password/validate', { token: raw }));
    show('weak short      ', await post('/auth/reset-password', { token: raw, password: 'abc12' }));
    show('weak no digit   ', await post('/auth/reset-password', { token: raw, password: 'abcdefghij' }));
    show('reset ok        ', await post('/auth/reset-password', { token: raw, password: 'NewPass456' }));
    show('reuse token     ', await post('/auth/reset-password', { token: raw, password: 'NewPass789' }));
    show('login old pw    ', await post('/auth/login', { email: MAIL, password: 'OldPass123' }));
    show('login new pw    ', await post('/auth/login', { email: MAIL, password: 'NewPass456' }));
    raw = await setTok('-1 minute');
    show('expired validate', await post('/auth/reset-password/validate', { token: raw }));
    show('expired reset   ', await post('/auth/reset-password', { token: raw, password: 'NewPass999' }));
    const codes = [];
    for (let i = 0; i < 8; i++) codes.push((await post('/auth/forgot-password', { email: 'x' + i + '@example.com' })).s);
    console.log('rapid requests:', codes.join(' '));
  } finally {
    if (MODE !== 'mail') { await pool.query('DELETE FROM users WHERE id=$1 AND full_name=$2', [u.id, NAME]); console.log('throwaway user deleted'); }
    await pool.end();
  }
})();
