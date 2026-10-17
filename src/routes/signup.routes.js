const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { signupLimiter } = require('../middleware/ratelimit.middleware');
const { normPhone } = require('../utils/phone');

const ROLES = ['student', 'teacher', 'parent'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fieldError = (res, code, message, field) =>
  res.status(code).json({ error: message, errors: field ? { [field]: message } : undefined });

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.role === 'school_admin' || b.role === 'super_admin') {
      return res.status(403).json({ error: 'This role cannot be created through public signup' });
    }
    const full_name = typeof b.full_name === 'string' ? b.full_name.trim().replace(/\s+/g, ' ') : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const phone = normPhone(b.phone);
    const pw = b.password;
    const sid = String(b.school_id == null ? '' : b.school_id);
    const errors = {};
    if (full_name.length < 2 || full_name.length > 100) errors.full_name = 'Enter your full name';
    if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address';
    if (!phone) errors.phone = 'Enter a valid Nigerian phone number';
    if (typeof pw !== 'string' || pw.length < 8 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      errors.password = 'Use 8 to 72 characters with at least one letter and one number';
    }
    if (!ROLES.includes(b.role)) errors.role = 'Choose student, teacher or parent';
    if (!/^\d{1,9}$/.test(sid) || Number(sid) < 1) errors.school_id = 'Choose your school';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please correct the highlighted fields', errors });

    const sc = await pool.query('SELECT id, name FROM schools WHERE id=$1 AND is_active=true', [sid]);
    const school = sc.rows[0];
    if (!school) return fieldError(res, 400, 'School not found', 'school_id');
    const admins = await pool.query(
      `SELECT id FROM users WHERE school_id=$1 AND role='school_admin' AND approval_status='approved' AND suspended_at IS NULL`,
      [school.id]);
    if (!admins.rowCount) return res.status(409).json({ error: 'This school is not accepting registrations yet' });
    const dup = await pool.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
    if (dup.rowCount) return fieldError(res, 409, 'An account with this email already exists', 'email');

    const hashed = await bcrypt.hash(pw, 10);
    let user;
    try {
      const r = await pool.query(
        `INSERT INTO users (school_id, full_name, email, password, role, phone, approval_status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending')
         RETURNING id, full_name, email, role, school_id, phone, approval_status, created_at`,
        [school.id, full_name, email, hashed, b.role, phone]);
      user = r.rows[0];
    } catch (e) {
      if (e.code === '23505') return fieldError(res, 409, 'An account with this email already exists', 'email');
      throw e;
    }
    try {
      for (const a of admins.rows) {
        await pool.query(
          `INSERT INTO notifications (school_id, user_id, title, body, type) VALUES ($1,$2,$3,$4,'approval')`,
          [school.id, a.id, 'New signup awaiting approval', `${full_name} signed up as ${b.role}. Review it in Approvals.`]);
      }
    } catch (e) { console.error('Signup notify error:', e.message); }
    res.status(201).json({ user, message: 'Account created. Your school administrator must approve it before you can sign in.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
