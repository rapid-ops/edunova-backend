const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // API key auth
  if (authHeader && authHeader.startsWith('ApiKey ')) {
    const rawKey = authHeader.split(' ')[1];
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    try {
      const r = await pool.query(
        `SELECT ak.*, s.id as sid FROM api_keys ak
         JOIN schools s ON s.id = ak.school_id
         WHERE ak.key_hash=$1 AND ak.is_active=true`,
        [keyHash]
      );
      if (!r.rows[0]) return res.status(401).json({ error: 'Invalid API key' });
      await pool.query(`UPDATE api_keys SET last_used_at=NOW() WHERE id=$1`, [r.rows[0].id]);
      req.user = { id: null, role: 'school_admin', school_id: r.rows[0].school_id, api_key: true };
      return next();
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // JWT auth
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

module.exports = { protect, authorize };
