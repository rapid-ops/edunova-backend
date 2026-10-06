const pool = require('../config/db');
const crypto = require('crypto');
const { sameSchool, schoolForCreate } = require('../utils/access');

const generate = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const rawKey = 'ek_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const r = await pool.query(
      `INSERT INTO api_keys (school_id, name, key_hash) VALUES ($1,$2,$3) RETURNING id, name, is_active, created_at`,
      [school_id, name, keyHash]
    );
    res.status(201).json({ api_key: { ...r.rows[0], key: rawKey } });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const list = async (req, res) => {
  try {
    const school_id = req.user.role === 'super_admin' ? req.query.school_id : req.user.school_id;
    if (!school_id) return res.status(400).json({ error: 'school_id required' });
    const r = await pool.query(
      `SELECT id, name, last_used_at, is_active, created_at FROM api_keys WHERE school_id=$1 ORDER BY created_at DESC`,
      [school_id]
    );
    res.json({ api_keys: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const revoke = async (req, res) => {
  try {
    const r = await pool.query(`SELECT school_id FROM api_keys WHERE id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'API key not found' });
    if (!sameSchool(req.user, r.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(`UPDATE api_keys SET is_active=false WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Revoked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { generate, list, revoke };
