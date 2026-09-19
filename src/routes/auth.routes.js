const router = require('express').Router();
const { register, login } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);

module.exports = router;

router.get('/users/:school_id', require('../middleware/auth.middleware').protect, async (req, res) => {
  const pool = require('../config/db');
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, is_active, created_at FROM users WHERE school_id=$1`,
      [req.params.school_id]
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
