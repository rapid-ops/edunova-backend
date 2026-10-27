const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const codes = require('../services/signupcode.service');
const { regStartIpLimiter, regEmailLimiter, regVerifyIpLimiter } = require('../middleware/ratelimit.middleware');
const { passwordError } = require('../utils/password');
const { normPhone } = require('../utils/phone');
const { slugify, isReserved, uniqueSubdomain } = require('../utils/subdomain');
const NIGERIA = require('../data/nigeria.json');
const { SCHOOL_TYPES, JOB_TITLES } = require('../data/register');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_TAKEN = 'This email is already registered. Log in or reset your password.';
const SCHOOL_EMAIL_TAKEN = 'A school with this email is already registered. If it is your school, log in with your administrator account.';
const NAME_RESERVED = 'That school name cannot be used. Please add more to the name.';
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const invalid = (res, errors, message) => res.status(400).json({ error: message || 'Please correct the highlighted fields', errors });

router.post('/school/start', regStartIpLimiter, regEmailLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const school = { name: str(b.school_name).replace(/\s+/g, ' '), type: str(b.school_type), state: str(b.state), lga: str(b.lga), address: str(b.address).replace(/\s+/g, ' '), phone: normPhone(b.school_phone), email: str(b.school_email) };
    const admin = { full_name: str(b.full_name).replace(/\s+/g, ' '), email: str(b.email), phone: normPhone(b.phone), job_title: str(b.job_title) };
    const errors = {};
    if (school.name.length < 3 || school.name.length > 120) errors.school_name = 'Enter your school name';
    if (!SCHOOL_TYPES.includes(school.type)) errors.school_type = 'Choose your school type';
    if (!has(NIGERIA, school.state)) errors.state = 'Choose your state';
    else if (!NIGERIA[school.state].includes(school.lga)) errors.lga = 'Choose your local government area';
    if (school.address.length < 5 || school.address.length > 200) errors.address = 'Enter the school address';
    if (!school.phone) errors.school_phone = 'Enter a valid Nigerian phone number';
    if (!EMAIL.test(school.email) || school.email.length > 254) errors.school_email = 'Enter a valid school email address';
    if (admin.full_name.length < 2 || admin.full_name.length > 100) errors.full_name = 'Enter your full name';
    if (!EMAIL.test(admin.email) || admin.email.length > 254) errors.email = 'Enter a valid work email address';
    if (!admin.phone) errors.phone = 'Enter a valid Nigerian phone number';
    if (!JOB_TITLES.includes(admin.job_title)) errors.job_title = 'Choose your job title';
    const pwErr = passwordError(b.password);
    if (pwErr) errors.password = pwErr;
    if (!errors.school_name) {
      const slug = slugify(school.name);
      if (slug.length < 3) errors.school_name = 'Please use letters in the school name';
      else if (isReserved(slug)) errors.school_name = NAME_RESERVED;
    }
    if (Object.keys(errors).length) return invalid(res, errors);

    const u = await pool.query('SELECT approval_status FROM users WHERE lower(email)=lower($1) LIMIT 1', [admin.email]);
    if (u.rowCount && u.rows[0].approval_status !== 'unverified') return res.status(409).json({ error: EMAIL_TAKEN, errors: { email: EMAIL_TAKEN } });
    const s = await pool.query('SELECT 1 FROM schools WHERE lower(email)=lower($1) LIMIT 1', [school.email]);
    if (s.rowCount) return res.status(409).json({ error: SCHOOL_EMAIL_TAKEN, errors: { school_email: SCHOOL_EMAIL_TAKEN } });

    const password_hash = await bcrypt.hash(b.password, 10);
    const r = await codes.issue({ email: admin.email, purpose: 'school', payload: { school, admin: { ...admin, password_hash } } });
    if (!r.ok) return res.status(r.status).json({ error: r.error, retry_after: r.wait });
    res.json({ message: `We sent a 6-digit code to ${admin.email}.`, email: admin.email, expires_in: 900, resend_after: codes.COOLDOWN_SEC });
  } catch (err) {
    console.error('School registration start error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/school/verify', regVerifyIpLimiter, async (req, res) => {
  const email = str((req.body || {}).email);
  const code = str((req.body || {}).code);
  if (!EMAIL.test(email)) return invalid(res, { email: 'Enter a valid email address' });
  if (!/^\d{6}$/.test(code)) return invalid(res, { code: 'Enter the 6-digit code' }, 'Enter the 6-digit code');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const chk = await codes.check(client, { email, purpose: 'school', code });
    if (!chk.ok) {
      await client.query(chk.commit ? 'COMMIT' : 'ROLLBACK');
      return res.status(chk.status).json({ error: chk.error, code: chk.code });
    }
    const { school, admin } = chk.row.payload;
    const taken = await client.query("SELECT 1 FROM users WHERE lower(email)=lower($1) AND approval_status <> 'unverified' LIMIT 1", [admin.email]);
    if (taken.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: EMAIL_TAKEN, code: 'EMAIL_TAKEN' }); }
    const sTaken = await client.query('SELECT 1 FROM schools WHERE lower(email)=lower($1) LIMIT 1', [school.email]);
    if (sTaken.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: SCHOOL_EMAIL_TAKEN, code: 'SCHOOL_EMAIL_TAKEN' }); }
    const slug = slugify(school.name);
    if (slug.length < 3 || isReserved(slug)) { await client.query('ROLLBACK'); return res.status(400).json({ error: NAME_RESERVED, code: 'NAME_RESERVED' }); }
    await client.query("DELETE FROM users WHERE lower(email)=lower($1) AND approval_status = 'unverified'", [admin.email]);
    const subdomain = await uniqueSubdomain(client, slug);
    const sc = await client.query(
      'INSERT INTO schools (name, email, phone, address, subdomain, school_type, state, lga) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, subdomain, email, school_type, state, lga',
      [school.name, school.email, school.phone, school.address, subdomain, school.type, school.state, school.lga]);
    const us = await client.query(
      `INSERT INTO users (school_id, full_name, email, password, role, phone, approval_status, email_verified_at)
       VALUES ($1,$2,$3,$4,'school_admin',$5,'approved', NOW())
       RETURNING id, full_name, email, role, school_id, totp_enabled, login_id`,
      [sc.rows[0].id, admin.full_name, admin.email, admin.password_hash, admin.phone]);
    await codes.consume(client, chk.row.id);
    await client.query('COMMIT');
    const user = us.rows[0];
    const token = jwt.sign({ id: user.id, role: user.role, school_id: user.school_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ school: sc.rows[0], user, token, must_change_password: false });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: EMAIL_TAKEN, code: 'EMAIL_TAKEN' });
    console.error('School registration verify error:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally { client.release(); }
});

router.post('/school/resend', regVerifyIpLimiter, regEmailLimiter, async (req, res) => {
  try {
    const email = str((req.body || {}).email);
    if (!EMAIL.test(email)) return invalid(res, { email: 'Enter a valid email address' });
    const r = await codes.resend({ email, purpose: 'school' });
    if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code, retry_after: r.wait });
    res.json({ message: `We sent a new code to ${email}.`, resend_after: codes.COOLDOWN_SEC });
  } catch (err) {
    console.error('School registration resend error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
