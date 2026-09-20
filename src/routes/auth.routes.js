const router = require('express').Router();
const { register, login } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

router.post('/register', register);
router.post('/login', login);

router.get('/users/:school_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, is_active, created_at, phone, avatar_url FROM users WHERE school_id=$1`,
      [req.params.school_id]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/:id', protect, async (req, res) => {
  const { full_name, email } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, email=$2 WHERE id=$3
       RETURNING id, full_name, email, role, school_id`,
      [full_name, email, req.params.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/password/:id', protect, async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.params.id]);
    const user = result.rows[0];
    const match = await bcrypt.compare(current_password, user.password);
    if (!match) return res.status(400).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query(`UPDATE users SET password=$1 WHERE id=$2`, [hashed, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Email not found' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await pool.query(
      `UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE email=$3`,
      [token, expires, email]
    );
    res.json({ message: 'Reset token generated', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()`,
      [token]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Invalid or expired token' });
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users SET password=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2`,
      [hashed, result.rows[0].id]
    );
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
