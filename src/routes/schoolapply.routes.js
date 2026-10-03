const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

pool.query(`CREATE TABLE IF NOT EXISTS school_applications (
  id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL, name TEXT, email TEXT, phone TEXT,
  programme TEXT, message TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(e => console.log('applications table:', e.message));

const hits = new Map();
const limited = ip => {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 3600000);
  if (a.length >= 10) return true;
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return false;
};
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

const own = (req, res, next) => {
  const u = req.user || {};
  if (u.role === 'super_admin' || (u.school_id && String(u.school_id) === String(req.params.id))) return next();
  res.status(403).json({ error: 'Not your school' });
};

router.post('/:subdomain', async (req, res) => {
  try {
    if (req.body.website) return res.json({ ok: true });
    const name = str(req.body.name, 100), email = str(req.body.email, 150), phone = str(req.body.phone, 30);
    const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || (!okMail && phone.replace(/\D/g, '').length < 7)) {
      return res.status(400).json({ error: 'Enter your name and a valid email or phone number.' });
    }
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (limited(ip)) return res.status(429).json({ error: 'Too many applications. Try again later.' });
    const s = await pool.query('SELECT id FROM schools WHERE lower(trim(subdomain)) = lower($1)', [str(req.params.subdomain, 60)]);
    if (!s.rows[0]) return res.status(404).json({ error: 'School not found' });
    await pool.query(
      'INSERT INTO school_applications (school_id,name,email,phone,programme,message,ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [s.rows[0].id, name, okMail ? email : '', phone, str(req.body.programme, 150), str(req.body.message, 2000), ip]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not send. Try again.' }); }
});

router.get('/school/:id', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,phone,programme,message,created_at FROM school_applications WHERE school_id=$1 ORDER BY created_at DESC LIMIT 500', [req.params.id]);
    res.json({ applications: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/school/:id/:appId', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.appId)) return res.status(400).json({ error: 'Bad id' });
    await pool.query('DELETE FROM school_applications WHERE id=$1 AND school_id=$2', [req.params.appId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
