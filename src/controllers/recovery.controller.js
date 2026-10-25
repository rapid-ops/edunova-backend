const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendEmail } = require('../services/email.service');

const MSG = 'If an account exists for that email, a reset link has been sent.';
const BAD = 'Invalid or expired link';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const appUrl = () => {
  const u = process.env.FRONTEND_URL;
  return u && !/localhost|127\.0\.0\.1/.test(u) ? u.replace(/\/+$/, '') : 'https://edunova-frontend-gkaj.vercel.app';
};
const strong = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /\d/.test(p);
const tokenOk = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);

const requestReset = async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email || email.length > 255 || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address' });
  const raw = crypto.randomBytes(32).toString('hex');
  try {
    const r = await pool.query('SELECT id, email, full_name FROM users WHERE lower(email)=$1 ORDER BY id LIMIT 1', [email]);
    const u = r.rows[0];
    if (u) {
      await pool.query("UPDATE users SET reset_token=$1, reset_token_expires=NOW() + INTERVAL '1 hour' WHERE id=$2", [sha(raw), u.id]);
      setImmediate(() => {
        try { Promise.resolve(sendEmail(u.email, 'password_reset', { name: u.full_name, link: appUrl() + '/auth/reset-password?token=' + raw })).catch(() => {}); } catch (e) {}
      });
    } else {
      await pool.query('UPDATE users SET reset_token=reset_token WHERE id=-1');
      void sha(raw);
    }
    res.json({ message: MSG });
  } catch (err) { res.status(500).json({ error: 'Something went wrong. Try again.' }); }
};

const validateToken = async (req, res) => {
  const token = req.body.token;
  if (!tokenOk(token)) return res.status(400).json({ valid: false, error: BAD });
  try {
    const r = await pool.query('SELECT 1 FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()', [sha(token)]);
    if (!r.rows[0]) return res.status(400).json({ valid: false, error: BAD });
    res.json({ valid: true });
  } catch (err) { res.status(500).json({ error: 'Something went wrong. Try again.' }); }
};

const completeReset = async (req, res) => {
  const { token, password } = req.body;
  if (!tokenOk(token)) return res.status(400).json({ error: BAD });
  if (!strong(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with a letter and a number' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'UPDATE users SET password=$1, reset_token=NULL, reset_token_expires=NULL, login_attempts=0, locked_until=NULL, password_set_at=NOW(), must_change_password=false, temp_password_expires=NULL WHERE reset_token=$2 AND reset_token_expires > NOW() RETURNING id',
      [hashed, sha(token)]
    );
    if (!r.rows[0]) return res.status(400).json({ error: BAD });
    res.json({ message: 'Password reset successful' });
  } catch (err) { res.status(500).json({ error: 'Something went wrong. Try again.' }); }
};

module.exports = { requestReset, validateToken, completeReset };
