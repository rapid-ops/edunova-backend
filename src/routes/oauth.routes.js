const router = require('express').Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google — frontend sends Google id_token
router.post('/google', async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: 'id_token required' });

    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, sub: googleId, name } = payload;

    const r = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    if (!r.rows[0]) {
      return res.status(404).json({ error: 'No account found for this Google email. Ask your school admin to create your account first.' });
    }
    const user = r.rows[0];
    if (user.suspended_at) {
      return res.status(401).json({ error: 'Account suspended, contact your administrator' });
    }
    if (!user.google_id) {
      await pool.query(`UPDATE users SET google_id=$1 WHERE id=$2`, [googleId, user.id]);
    }
    if (user.totp_enabled) {
      const partialToken = jwt.sign({ id: user.id, totp_pending: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.json({ totp_required: true, partial_token: partialToken });
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, school_id: user.school_id },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
