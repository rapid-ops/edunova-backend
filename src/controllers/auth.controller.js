const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findUserByEmail } = require('../models/user.model');
const pool = require('../config/db');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Suspension check
    if (user.suspended_at) {
      return res.status(401).json({ error: 'Account suspended, contact your administrator' });
    }

    // Lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(401).json({ error: `Account locked. Try again in ${mins} minute(s)` });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      const attempts = (user.login_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        await pool.query(
          `UPDATE users SET login_attempts=$1, locked_until=$2 WHERE id=$3`,
          [attempts, lockedUntil, user.id]
        );
        return res.status(401).json({ error: `Account locked for ${LOCK_MINUTES} minutes after too many failed attempts` });
      }
      await pool.query(`UPDATE users SET login_attempts=$1 WHERE id=$2`, [attempts, user.id]);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset attempts on success
    await pool.query(`UPDATE users SET login_attempts=0, locked_until=NULL WHERE id=$1`, [user.id]);

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const payload = {
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        school_id: user.school_id,
        totp_enabled: user.totp_enabled,
      },
      token,
    };

    // If TOTP enabled, don't return full token yet — return partial token
    if (user.totp_enabled) {
      const partialToken = jwt.sign(
        { id: user.id, totp_pending: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({ totp_required: true, partial_token: partialToken });
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { login };
