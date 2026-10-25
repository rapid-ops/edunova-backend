const { track } = require('../middleware/analytics.middleware');
const router = require('express').Router();
const { login } = require('../controllers/auth.controller');
const { register, forgotPassword, adminResetPassword } = require('../controllers/authsecure.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const isSelf = (req) => Number(req.user.id) === Number(req.params.id);

router.post('/register', register);
const { loginLimiter } = require('../middleware/ratelimit.middleware');
router.post('/login', loginLimiter, track('login'), login);
router.post('/forgot-password', forgotPassword);
router.post('/admin-reset/:user_id', protect, authorize('school_admin', 'super_admin'), adminResetPassword);

router.get('/users/:school_id', protect, async (req, res) => {
  if (req.user.role !== 'super_admin' && Number(req.user.school_id) !== Number(req.params.school_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    const result = await pool.query(
      `SELECT id, full_name, CASE WHEN email LIKE '%@no-email.invalid' THEN '' ELSE email END AS email, role, is_active, created_at, phone, avatar_url FROM users WHERE school_id=$1 AND approval_status='approved'`,
      [req.params.school_id]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile/:id', protect, async (req, res) => {
  if (!isSelf(req)) return res.status(403).json({ error: 'Access denied' });
  const full_name = String(req.body.full_name || '').trim();
  const email = String(req.body.email || '').trim();
  if (!full_name || !email) return res.status(400).json({ error: 'Name and email are required' });
  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, email=$2 WHERE id=$3
       RETURNING id, full_name, email, role, school_id`,
      [full_name, email, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/password/:id', protect, async (req, res) => {
  if (!isSelf(req)) return res.status(403).json({ error: 'Access denied' });
  const { current_password, new_password } = req.body;
  if (req.user.pwc && (typeof new_password !== 'string' || new_password.length < 8 || new_password.length > 72 || !/[A-Za-z]/.test(new_password) || !/\d/.test(new_password))) {
    return res.status(400).json({ error: 'Choose a password with at least 8 characters, including a letter and a number' });
  }
  if (!current_password || typeof new_password !== 'string' || new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const result = await pool.query(`SELECT password FROM users WHERE id=$1`, [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const match = await bcrypt.compare(req.user.pwc ? String(current_password).trim().toUpperCase() : String(current_password), user.password);
    if (!match) return res.status(400).json({ error: 'Current password incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query(`UPDATE users SET password=$1 WHERE id=$2`, [hashed, req.user.id]);
    await pool.query(`UPDATE users SET password_set_at=NOW(), must_change_password=false, temp_password_expires=NULL WHERE id=$1`, [req.user.id]);
    if (req.user.pwc) {
      const nu = await pool.query(`SELECT id, role, school_id FROM users WHERE id=$1`, [req.user.id]);
      const x = nu.rows[0];
      const token = jwt.sign({ id: x.id, role: x.role, school_id: x.school_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ message: 'Password updated', token });
    }
    res.json({ message: 'Password updated' });
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
