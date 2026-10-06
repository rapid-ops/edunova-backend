const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Called after Google verifies the user
const googleCallback = async (req, res) => {
  try {
    const { email, googleId, name } = req.googleUser;
    // Only link — no auto-registration
    const r = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    if (!r.rows[0]) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'https://edunova-frontend-gkaj.vercel.app'}/auth/login?error=no_account`
      );
    }
    const user = r.rows[0];
    if (user.suspended_at) {
      return res.redirect(
        `${process.env.FRONTEND_URL || 'https://edunova-frontend-gkaj.vercel.app'}/auth/login?error=suspended`
      );
    }
    // Save google_id if not already saved
    if (!user.google_id) {
      await pool.query(`UPDATE users SET google_id=$1 WHERE id=$2`, [googleId, user.id]);
    }
    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const encoded = encodeURIComponent(JSON.stringify({
      id: user.id, full_name: user.full_name, email: user.email,
      role: user.role, school_id: user.school_id,
    }));
    res.redirect(
      `${process.env.FRONTEND_URL || 'https://edunova-frontend-gkaj.vercel.app'}/auth/oauth-callback?token=${token}&user=${encoded}`
    );
  } catch (err) {
    res.redirect(
      `${process.env.FRONTEND_URL || 'https://edunova-frontend-gkaj.vercel.app'}/auth/login?error=server`
    );
  }
};

module.exports = { googleCallback };
