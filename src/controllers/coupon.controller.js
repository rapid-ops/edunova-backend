const pool = require('../config/db');
const m = require('../models/coupon.model');
const { validId, sameSchool } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });

// Slows down people guessing coupon codes on the public check
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 600000);
  if (a.length >= 30) return true;
  a.push(now);
  hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return false;
};

const loadCoupon = async (req, res, id) => {
  if (!validId(id)) { res.status(404).json({ error: 'Coupon not found' }); return null; }
  const r = await pool.query(`SELECT id, school_id FROM coupons WHERE id=$1`, [id]);
  const c = r.rows[0];
  if (!c) { res.status(404).json({ error: 'Coupon not found' }); return null; }
  if (!sameSchool(req.user, c.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return c;
};

const create = async (req, res) => {
  try {
    const { code, discount_percent, max_uses, expires_at } = req.body;
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{3,50}$/.test(code.trim())) {
      return res.status(400).json({ error: 'Code must be 3 to 50 letters, numbers, - or _' });
    }
    const d = Number(discount_percent);
    if (discount_percent === undefined || discount_percent === null || discount_percent === '' || !Number.isFinite(d) || d <= 0 || d > 100) {
      return res.status(400).json({ error: 'Discount must be above 0 and at most 100 percent' });
    }
    const mu = max_uses === undefined || max_uses === null || max_uses === '' ? 1 : Number(max_uses);
    if (!Number.isInteger(mu) || mu < 1 || mu > 100000) return res.status(400).json({ error: 'Max uses must be 1 to 100000' });
    if (expires_at && Number.isNaN(Date.parse(expires_at))) return res.status(400).json({ error: 'Invalid expiry date' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const c = await m.create({ school_id, code: code.trim(), discount_percent: d, max_uses: mu, expires_at: expires_at || null });
    res.status(201).json({ coupon: c });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'That code already exists' });
    fail(res, err);
  }
};

const validate = async (req, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (limited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const { code, school_id } = req.body;
    if (typeof code !== 'string' || !code.trim() || code.length > 50 || !validId(school_id)) {
      return res.status(404).json({ error: 'Invalid or expired coupon' });
    }
    const c = await m.validate(code.trim(), school_id);
    if (!c) return res.status(404).json({ error: 'Invalid or expired coupon' });
    res.json({ coupon: { id: c.id, code: c.code, discount_percent: c.discount_percent, expires_at: c.expires_at } });
  } catch (err) { fail(res, err); }
};

const apply = async (req, res) => {
  try {
    const c = await loadCoupon(req, res, req.params.id);
    if (!c) return;
    const r = await pool.query(
      `UPDATE coupons SET used_count=used_count+1
       WHERE id=$1 AND is_active=true AND used_count<max_uses AND (expires_at IS NULL OR expires_at>NOW())
       RETURNING id`,
      [c.id]
    );
    if (!r.rowCount) return res.status(400).json({ error: 'This coupon cannot be used' });
    res.json({ message: 'Coupon applied' });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ coupons: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const c = await loadCoupon(req, res, req.params.id);
    if (!c) return;
    await m.remove(c.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, validate, apply, list, remove };
