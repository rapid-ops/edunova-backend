const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { sendMail } = require('../utils/mail');

pool.query(`CREATE TABLE IF NOT EXISTS contact_enquiries (
  id SERIAL PRIMARY KEY, name TEXT, email TEXT, school_name TEXT, school_subdomain TEXT,
  message TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(e => console.log('contact table:', e.message));

const hits = new Map();
const limited = ip => {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 3600000);
  if (a.length >= 5) return true;
  a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return false;
};
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

router.post('/', async (req, res) => {
  try {
    if (req.body.website) return res.json({ ok: true });
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (limited(ip)) return res.status(429).json({ error: 'Too many messages. Try again later.' });
    const name = str(req.body.name, 100), email = str(req.body.email, 150);
    const message = str(req.body.message, 2000);
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Name, valid email and message are required.' });
    await pool.query(
      'INSERT INTO contact_enquiries (name,email,school_name,school_subdomain,message,ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [name, email, str(req.body.school_name, 150), str(req.body.school_subdomain, 60), message, ip]);
    sendMail({
      to: process.env.NOTIFY_EMAIL || 'contact.rapidops@gmail.com', replyTo: email,
      subject: 'Edunova enquiry from ' + name,
      body: ['Name: ' + name, 'Email: ' + email, 'School: ' + (str(req.body.school_name, 150) || '-'), '', message].join('\n'),
    });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not send. Try again.' }); }
});

router.get('/', protect, authorize('super_admin'), async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM contact_enquiries ORDER BY created_at DESC LIMIT 200');
    res.json({ enquiries: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
