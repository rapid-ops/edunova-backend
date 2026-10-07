const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendWhatsApp } = require('../services/whatsapp.service');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Initialize transaction
router.post('/initialize', async (req, res) => {
  const { fee_id, email, amount, student_id, school_id } = req.body;
  try {
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100), // kobo
        metadata: { fee_id, student_id, school_id },
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
      }),
    });
    const data = await resp.json();
    if (!data.status) return res.status(400).json({ error: data.message });
    res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify transaction
router.get('/verify/:reference', async (req, res) => {
  const { reference } = req.params;
  try {
    const resp = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = await resp.json();
    if (!data.status || data.data.status !== 'success') {
      return res.json({ success: false, reason: data.data?.gateway_response || 'Payment failed' });
    }

    const { fee_id, student_id, school_id } = data.data.metadata;
    const amount = data.data.amount / 100;

    // Mark fee as paid
    await pool.query(
      `UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1`,
      [fee_id]
    );

    // Get student + parent info
    const feeResult = await pool.query(
      `SELECT f.description, u.full_name as student_name, u.phone as student_phone,
              p.full_name as parent_name, p.phone as parent_phone, s.name as school_name
       FROM fees f
       JOIN users u ON u.id = $1
       LEFT JOIN student_parents sp ON sp.student_id = $1
       LEFT JOIN users p ON p.id = sp.parent_id
       JOIN schools s ON s.id = $2
       WHERE f.id = $3`,
      [student_id, school_id, fee_id]
    );
    const info = feeResult.rows[0];

    // WhatsApp receipt
    if (info?.parent_phone) {
      await sendWhatsApp(
        info.parent_phone,
        `✅ Payment Confirmed\nDear ${info.parent_name}, ₦${amount.toLocaleString()} fee payment for ${info.student_name} has been received. Reference: ${reference}. Thank you!`
      );
    }

    res.json({ success: true, amount, reference, fee: info });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Payment history
router.get('/history/:student_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM fees WHERE student_id=$1 ORDER BY created_at DESC`,
      [req.params.student_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Revenue summary and history for school admins
const { protect, authorize } = require('../middleware/auth.middleware');
router.get('/revenue/:school_id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const school_id = req.params.school_id;
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
    res.status(500).json({ error: err.message });
  }
});
