const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/db');
const { sendWhatsApp } = require('../services/whatsapp.service');
const { sendEmail } = require('../services/email.service');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, canSeeStudent } = require('../utils/access');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const STAFF = ['school_admin', 'teacher'];
const kobo = (n) => Math.round(Number(n) * 100);
const paystack = (path, opts = {}) => fetch('https://api.paystack.co' + path, {
  ...opts,
  headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
  signal: AbortSignal.timeout(15000),
});

// Receipts: one in-app notification (awaited) plus email and WhatsApp (never allowed to fail the payment)
const sendReceipts = async (attempt, amount, reference) => {
  const r = await pool.query(
    `SELECT f.description, u.full_name AS student_name, s.name AS school_name
     FROM fees f JOIN users u ON u.id=f.student_id JOIN schools s ON s.id=f.school_id WHERE f.id=$1`, [attempt.fee_id]);
  const info = r.rows[0];
  if (!info) return;
  const desc = info.description || 'School fee';
  try {
    await pool.query(`INSERT INTO notifications (school_id, user_id, title, body, type) VALUES ($1,$2,$3,$4,'payment')`,
      [attempt.school_id, attempt.user_id, 'Payment received',
        `Payment of NGN ${amount.toLocaleString('en-NG')} for ${info.student_name} (${desc}) was received. Reference: ${reference}.`]);
  } catch (e) { console.error('receipt notification failed:', e.message); }
  (async () => {
    try {
      const p = (await pool.query('SELECT email FROM users WHERE id=$1', [attempt.user_id])).rows[0];
      if (p && p.email) await sendEmail(p.email, 'payment_receipt', { amount, student_name: info.student_name, description: desc, reference, school_name: info.school_name });
    } catch (e) { console.error('receipt email failed:', e.message); }
    try {
      const ps = await pool.query(
        `SELECT u.full_name, u.phone FROM parent_student ps JOIN users u ON u.id=ps.parent_id
         WHERE ps.student_id=$1 AND u.phone IS NOT NULL AND u.phone <> ''`, [attempt.student_id]);
      for (const p of ps.rows) {
        try {
          await sendWhatsApp(p.phone, `Payment confirmed. Dear ${p.full_name}, NGN ${amount.toLocaleString('en-NG')} fee payment for ${info.student_name} has been received. Reference: ${reference}. Thank you!`);
        } catch (e) { console.error('receipt whatsapp failed:', e.message); }
      }
    } catch (e) { console.error('receipt whatsapp lookup failed:', e.message); }
  })();
};

// Start a Paystack payment: amount and email come from the server, never from the client
router.post('/initialize', protect, async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.status(503).json({ error: 'Online payments are not available right now' });
    const { fee_id } = req.body || {};
    if (!validId(fee_id)) return res.status(400).json({ error: 'fee_id required' });
    if (!req.user.id) return res.status(403).json({ error: 'Access denied' });
    const fr = await pool.query('SELECT * FROM fees WHERE id=$1', [fee_id]);
    const fee = fr.rows[0];
    if (!fee) return res.status(404).json({ error: 'Fee not found' });
    const a = await canSeeStudent(req.user, fee.student_id, STAFF);
    if (a.error) return res.status(a.code).json({ error: a.error });
    if (fee.status === 'paid') return res.status(409).json({ error: 'This fee is already paid' });
    const ur = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const email = ur.rows[0] && ur.rows[0].email;
    if (!email) return res.status(400).json({ error: 'Your account has no email address' });
    const reference = `EDU-${fee.id}-${crypto.randomBytes(8).toString('hex')}`;
    await pool.query(
      `INSERT INTO payment_attempts (reference, fee_id, school_id, student_id, user_id, amount) VALUES ($1,$2,$3,$4,$5,$6)`,
      [reference, fee.id, fee.school_id, fee.student_id, req.user.id, fee.amount]);
    const resp = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({ email, amount: kobo(fee.amount), currency: 'NGN', reference, metadata: { fee_id: fee.id }, callback_url: `${process.env.FRONTEND_URL}/payment/verify` }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.status) {
      console.error('paystack initialize failed:', data.message || resp.status);
      await pool.query('DELETE FROM payment_attempts WHERE reference=$1', [reference]);
      return res.status(502).json({ error: 'Could not start the payment. Please try again shortly.' });
    }
    res.json({ authorization_url: data.data.authorization_url, reference });
  } catch (err) {
    console.error('payment initialize:', err.message);
    res.status(500).json({ error: 'Could not start the payment' });
  }
});

// Confirm a payment: only references we created, amount and currency checked against our own record
router.get('/verify/:reference', protect, async (req, res) => {
  const reference = req.params.reference;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(reference)) return res.status(404).json({ error: 'Unknown payment reference' });
  try {
    const ar = await pool.query('SELECT * FROM payment_attempts WHERE reference=$1', [reference]);
    const attempt = ar.rows[0];
    if (!attempt) return res.status(404).json({ error: 'Unknown payment reference' });
    const a = await canSeeStudent(req.user, attempt.student_id, STAFF);
    if (a.error) return res.status(403).json({ error: 'Access denied' });
    const amount = Number(attempt.amount);
    if (attempt.status === 'paid') return res.json({ success: true, already_processed: true, amount, reference });
    if (!PAYSTACK_SECRET) return res.status(503).json({ error: 'Online payments are not available right now' });

    const resp = await paystack('/transaction/verify/' + encodeURIComponent(reference));
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.status || !data.data) {
      console.error('paystack verify failed:', data.message || resp.status);
      return res.status(502).json({ error: 'Could not confirm the payment right now. Please try again shortly.' });
    }
    const t = data.data;
    if (t.status !== 'success') return res.json({ success: false, reason: t.gateway_response || 'Payment not completed' });
    if (t.reference !== reference || t.currency !== 'NGN' || Number(t.amount) !== kobo(attempt.amount)) {
      console.error('paystack amount mismatch:', reference, t.amount, t.currency);
      return res.status(400).json({ success: false, error: 'The amount paid does not match this fee. Please contact the school.' });
    }

    const client = await pool.connect();
    let first = false;
    try {
      await client.query('BEGIN');
      const lock = await client.query('SELECT status FROM payment_attempts WHERE reference=$1 FOR UPDATE', [reference]);
      if (lock.rows[0].status === 'paid') {
        await client.query('COMMIT');
      } else {
        const fr = await client.query('SELECT * FROM fees WHERE id=$1 FOR UPDATE', [attempt.fee_id]);
        const fee = fr.rows[0];
        if (!fee || fee.status === 'paid') {
          await client.query('ROLLBACK');
          console.error('paystack payment received for an already paid fee:', reference);
          return res.status(409).json({ success: false, error: 'This fee was already paid another way. Please contact the school about a refund.' });
        }
        await client.query(
          `INSERT INTO payments (school_id, fee_id, student_id, amount, method, reference, recorded_by, paid_at)
           VALUES ($1,$2,$3,$4,'paystack',$5,$6,NOW())`,
          [attempt.school_id, attempt.fee_id, attempt.student_id, attempt.amount, reference, attempt.user_id]);
        await client.query(`UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1`, [fee.id]);
        await client.query(`UPDATE payment_attempts SET status='paid', used_at=NOW() WHERE reference=$1`, [reference]);
        await client.query('COMMIT');
        first = true;
      }
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (x) {}
      if (e.code !== '23505') throw e;
    } finally { client.release(); }

    if (first) await sendReceipts(attempt, amount, reference);
    res.json({ success: true, already_processed: !first, amount, reference });
  } catch (err) {
    console.error('payment verify:', err.message);
    res.status(500).json({ error: 'Could not confirm the payment right now. Please try again shortly.' });
  }
});

// Fee history for one student: the student, a linked parent, staff of the same school, or super admin
router.get('/history/:student_id', protect, async (req, res) => {
  try {
    const a = await canSeeStudent(req.user, req.params.student_id, STAFF);
    if (a.error) return res.status(a.code).json({ error: a.error });
    const result = await pool.query('SELECT * FROM fees WHERE student_id=$1 ORDER BY created_at DESC', [a.student.id]);
    res.json(result.rows);
  } catch (err) {
    console.error('payment history:', err.message);
    res.status(500).json({ error: 'History unavailable' });
  }
});

// Revenue summary and history for school admins
router.get('/revenue/:school_id', protect, authorize('super_admin', 'school_admin'), async (req, res) => {
  const school_id = req.params.school_id;
  if (!validId(school_id)) return res.status(404).json({ error: 'School not found' });
  if (!sameSchool(req.user, school_id)) return res.status(403).json({ error: 'Access denied' });
  try {
    const summary = await pool.query(
      `SELECT
        COALESCE(SUM(amount),0) AS total_revenue,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month',paid_at)=DATE_TRUNC('month',NOW()) THEN amount ELSE 0 END),0) AS this_month,
        COUNT(*) AS total_payments
       FROM fees WHERE school_id=$1 AND status='paid'`,
      [school_id]
    );
    const history = await pool.query(
      `SELECT f.id, f.amount, f.description AS fee_title, f.paid_at AS created_at, u.full_name AS student_name
       FROM fees f JOIN users u ON u.id=f.student_id
       WHERE f.school_id=$1 AND f.status='paid'
       ORDER BY f.paid_at DESC LIMIT 100`,
      [school_id]
    );
    res.json({ ...summary.rows[0], payments: history.rows });
  } catch (err) {
    console.error('payment revenue:', err.message);
    res.status(500).json({ error: 'Revenue unavailable' });
  }
});

module.exports = router;
