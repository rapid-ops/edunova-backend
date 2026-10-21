const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');

const ADMIN = authorize('super_admin', 'school_admin');
const METHODS = ['cash', 'bank_transfer', 'pos', 'cheque', 'paystack', 'other'];
const INV = `('INV-' || to_char((f.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos', 'YYYY') || '-' || lpad(f.id::text, 5, '0'))`;
const OVERDUE = `(f.status='overdue' OR (f.status='pending' AND f.due_date < NOW()))`;
const STATUS_SQL = {
  paid: `f.status='paid'`,
  overdue: OVERDUE,
  pending: `(f.status='pending' AND (f.due_date IS NULL OR f.due_date >= NOW()))`,
};
const num = (v) => Number(v || 0);
const naira = (n) => '\u20A6' + Number(n).toLocaleString('en-NG');
const lagosDate = (d) => new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium' }).format(new Date(d));

const guard = (req, res) => {
  const id = req.params.school_id;
  if (!validId(id)) { res.status(404).json({ error: 'School not found' }); return null; }
  if (!sameSchool(req.user, id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return Number(id);
};

router.get('/school/:school_id/invoices', protect, ADMIN, async (req, res) => {
  try {
    const sid = guard(req, res); if (sid === null) return;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const where = ['f.school_id=$1'];
    const params = [sid];
    if (req.query.status && STATUS_SQL[req.query.status]) where.push(STATUS_SQL[req.query.status]);
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
      params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
      where.push(`(u.full_name ILIKE $${params.length} OR f.description ILIKE $${params.length} OR ${INV} ILIKE $${params.length})`);
    }
    const W = where.join(' AND ');
    const [sum, cnt, rows] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total_due,
        COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS collected,
        COALESCE(SUM(amount) FILTER (WHERE status<>'paid'),0) AS outstanding,
        COALESCE(SUM(amount) FILTER (WHERE status='overdue' OR (status='pending' AND due_date < NOW())),0) AS overdue_amount,
        COUNT(*) AS invoices, COUNT(*) FILTER (WHERE status='paid') AS paid_count,
        COUNT(*) FILTER (WHERE status<>'paid') AS unpaid_count,
        COUNT(*) FILTER (WHERE status='overdue' OR (status='pending' AND due_date < NOW())) AS overdue_count
        FROM fees f WHERE f.school_id=$1`, [sid]),
      pool.query(`SELECT COUNT(*) FROM fees f JOIN users u ON u.id=f.student_id WHERE ${W}`, params),
      pool.query(`SELECT f.id, f.student_id, u.full_name AS student_name, f.description, f.amount, f.status,
          CASE WHEN f.status='pending' AND f.due_date < NOW() THEN 'overdue' ELSE f.status END AS display_status,
          f.due_date, f.paid_at, f.created_at, ${INV} AS invoice_no, lp.method AS payment_method, lp.reference AS payment_reference
        FROM fees f JOIN users u ON u.id=f.student_id
        LEFT JOIN LATERAL (SELECT method, reference FROM payments p WHERE p.fee_id=f.id ORDER BY p.id DESC LIMIT 1) lp ON true
        WHERE ${W} ORDER BY f.created_at DESC, f.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
    ]);
    const s = sum.rows[0];
    res.json({
      summary: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, num(v)])),
      invoices: rows.rows.map((r) => ({ ...r, amount: num(r.amount) })),
      page, limit, total: num(cnt.rows[0].count),
    });
  } catch (e) {
    console.error('finance invoices:', e.message);
    res.status(500).json({ error: 'Invoices unavailable' });
  }
});

router.get('/school/:school_id/payments', protect, ADMIN, async (req, res) => {
  try {
    const sid = guard(req, res); if (sid === null) return;
    const r = await pool.query(`SELECT p.id, p.amount, p.method, p.reference, p.paid_at, u.full_name AS student_name, ${INV} AS invoice_no
      FROM payments p JOIN fees f ON f.id=p.fee_id JOIN users u ON u.id=p.student_id
      WHERE p.school_id=$1 ORDER BY p.paid_at DESC, p.id DESC LIMIT 10`, [sid]);
    res.json({ payments: r.rows.map((x) => ({ ...x, amount: num(x.amount) })) });
  } catch (e) {
    console.error('finance payments:', e.message);
    res.status(500).json({ error: 'Payments unavailable' });
  }
});

router.post('/fees/:id/payments', protect, ADMIN, async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Invoice not found' });
  const { method, reference, note, paid_at } = req.body || {};
  if (!METHODS.includes(method)) return res.status(400).json({ error: 'Choose a valid payment method' });
  let when = new Date();
  if (paid_at) {
    when = new Date(paid_at);
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 86400000) return res.status(400).json({ error: 'Invalid payment date' });
  }
  const ref = reference ? String(reference).trim().slice(0, 100) : null;
  const nt = note ? String(note).trim().slice(0, 255) : null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT * FROM fees WHERE id=$1 FOR UPDATE', [req.params.id]);
    const fee = r.rows[0];
    if (!fee) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }
    if (!sameSchool(req.user, fee.school_id)) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Access denied' }); }
    if (fee.status === 'paid') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Invoice is already paid' }); }
    const p = await client.query(
      `INSERT INTO payments (school_id, fee_id, student_id, amount, method, reference, note, recorded_by, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [fee.school_id, fee.id, fee.student_id, fee.amount, method, ref, nt, req.user.id || null, when]);
    const u = await client.query(`UPDATE fees SET status='paid', paid_at=$2 WHERE id=$1 RETURNING *`, [fee.id, when]);
    await client.query('COMMIT');
    res.status(201).json({ payment: p.rows[0], fee: u.rows[0] });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) {}
    console.error('finance record payment:', e.message);
    res.status(500).json({ error: 'Could not record payment' });
  } finally { client.release(); }
});

router.post('/fees/:id/remind', protect, ADMIN, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Invoice not found' });
    const r = await pool.query(`SELECT f.*, u.full_name AS student_name, ${INV} AS invoice_no
      FROM fees f JOIN users u ON u.id=f.student_id WHERE f.id=$1`, [req.params.id]);
    const fee = r.rows[0];
    if (!fee) return res.status(404).json({ error: 'Invoice not found' });
    if (!sameSchool(req.user, fee.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (fee.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid' });
    const title = 'Fee reminder: ' + fee.invoice_no;
    const dup = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id=$1 AND type='fee' AND title=$2 AND created_at > NOW() - INTERVAL '1 day' LIMIT 1`,
      [fee.student_id, title]);
    if (dup.rowCount) return res.status(409).json({ error: 'A reminder for this invoice was already sent in the last 24 hours' });
    const late = fee.status === 'overdue' || (fee.status === 'pending' && fee.due_date && new Date(fee.due_date) < new Date());
    const what = (fee.description || 'School fee') + ' of ' + naira(fee.amount);
    const tail = (late ? ' is overdue' : ' is due') + (fee.due_date ? ' (due ' + lagosDate(fee.due_date) + ')' : '') + '. Please settle it as soon as you can.';
    const parents = await pool.query('SELECT parent_id FROM parent_student WHERE student_id=$1', [fee.student_id]);
    const ins = `INSERT INTO notifications (school_id, user_id, title, body, type) VALUES ($1,$2,$3,$4,'fee')`;
    await pool.query(ins, [fee.school_id, fee.student_id, title, what + tail]);
    for (const p of parents.rows) {
      await pool.query(ins, [fee.school_id, p.parent_id, title, what + ' for ' + fee.student_name + tail]);
    }
    res.json({ sent: 1 + parents.rowCount });
  } catch (e) {
    console.error('finance remind:', e.message);
    res.status(500).json({ error: 'Could not send reminder' });
  }
});

module.exports = router;
