const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');
const { sendEmail } = require('../services/email.service');

const ADMIN = authorize('super_admin', 'school_admin');

const mail = async (u, template, extra) => {
  try {
    const s = await pool.query('SELECT name FROM schools WHERE id=$1', [u.school_id]);
    await sendEmail(u.email, template, { name: u.full_name, school_name: (s.rows[0] && s.rows[0].name) || 'your school', ...extra });
  } catch (e) { console.error('Approval email error:', e.message); }
};

const load = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'User not found' }); return null; }
  const r = await pool.query('SELECT id, full_name, email, role, school_id, approval_status FROM users WHERE id=$1', [req.params.id]);
  const u = r.rows[0];
  if (!u) { res.status(404).json({ error: 'User not found' }); return null; }
  if (!sameSchool(req.user, u.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return u;
};

router.get('/pending', protect, ADMIN, async (req, res) => {
  try {
    let sql = `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.school_id, u.created_at, s.name AS school_name
               FROM users u JOIN schools s ON s.id=u.school_id WHERE u.approval_status='pending'`;
    const params = [];
    if (req.user.role === 'super_admin') {
      if (req.query.school_id !== undefined) {
        if (!validId(req.query.school_id)) return res.status(400).json({ error: 'Invalid school_id' });
        params.push(req.query.school_id);
        sql += ' AND u.school_id=$1';
      }
    } else {
      if (req.user.school_id == null) return res.status(403).json({ error: 'Access denied' });
      params.push(req.user.school_id);
      sql += ' AND u.school_id=$1';
    }
    const r = await pool.query(sql + ' ORDER BY u.created_at ASC LIMIT 500', params);
    res.json({ users: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/approve', protect, ADMIN, async (req, res) => {
  try {
    const u = await load(req, res);
    if (!u) return;
    const r = await pool.query(
      `UPDATE users SET approval_status='approved', rejection_reason=NULL, approved_by=$2, approved_at=NOW()
       WHERE id=$1 AND approval_status='pending'
       RETURNING id, full_name, email, role, school_id, approval_status`,
      [u.id, req.user.id || null]);
    if (!r.rows[0]) return res.status(409).json({ error: 'This account is already ' + u.approval_status });
    mail(r.rows[0], 'account_approved', {});
    res.json({ user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/reject', protect, ADMIN, async (req, res) => {
  try {
    const u = await load(req, res);
    if (!u) return;
    const reason = typeof (req.body || {}).reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500) return res.status(400).json({ error: 'Give a reason of 3 to 500 characters' });
    const r = await pool.query(
      `UPDATE users SET approval_status='rejected', rejection_reason=$2, approved_by=$3, approved_at=NOW()
       WHERE id=$1 AND approval_status='pending'
       RETURNING id, full_name, email, role, school_id, approval_status, rejection_reason`,
      [u.id, reason, req.user.id || null]);
    if (!r.rows[0]) return res.status(409).json({ error: 'This account is already ' + u.approval_status });
    mail(r.rows[0], 'account_rejected', { reason });
    res.json({ user: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
