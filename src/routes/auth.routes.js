const router = require('express').Router();
const { login } = require('../controllers/auth.controller');
const { register, forgotPassword, adminResetPassword } = require('../controllers/authsecure.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/admin-reset/:user_id', protect, authorize('school_admin', 'super_admin'), adminResetPassword);

router.get('/users/:school_id', protect, async (req, res) => {
  if (req.user.role !== 'super_admin' && Number(req.user.school_id) !== Number(req.params.school_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
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
