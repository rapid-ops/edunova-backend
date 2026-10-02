const router = require('express').Router();
const axios = require('axios');
const crypto = require('crypto');
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');
const { validId, canSeeStudent } = require('../utils/access');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const kobo = (amount) => Math.round(Number(amount) * 100);
const getFee = async (id) => {
  const r = await pool.query(`SELECT * FROM fees WHERE id=$1`, [id]);
  return r.rows[0] || null;
};
const amountOk = (data, fee) =>
  (!data.currency || data.currency === 'NGN') && Number(data.amount) >= kobo(fee.amount);

// Initialize payment: the amount always comes from the fee record, never from the request
router.post('/initialize', protect, async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Payments are not set up yet' });
    const { fee_id } = req.body;
    if (!validId(fee_id)) return res.status(400).json({ error: 'fee_id required' });
    const fee = await getFee(fee_id);
    if (!fee) return res.status(404).json({ error: 'Fee not found' });
    const access = await canSeeStudent(req.user, fee.student_id, ['school_admin']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (fee.status === 'paid') return res.status(400).json({ error: 'This fee is already paid' });
    const u = await pool.query(`SELECT email FROM users WHERE id=$1`, [req.user.id]);
    const email = u.rows[0] && u.rows[0].email;
    if (!email) return res.status(400).json({ error: 'Your account has no email address' });

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: kobo(fee.amount),
        metadata: { fee_id: fee.id },
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' } }
    );
    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not start the payment' });
  }
});

// Verify payment: marks a fee paid only if the amount received covers it
router.get('/verify/:reference', protect, async (req, res) => {
  const { reference } = req.params;
  try {
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Payments are not set up yet' });
    if (!/^[A-Za-z0-9_=-]{4,100}$/.test(reference)) return res.status(400).json({ error: 'Invalid reference' });
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const data = response.data.data;
    if (data.status !== 'success') return res.json({ success: false, message: 'Payment not successful' });

    const fee_id = data.metadata && data.metadata.fee_id;
    const fee = validId(fee_id) ? await getFee(fee_id) : null;
    if (!fee) return res.json({ success: false, message: 'This payment is not linked to a fee' });
    const access = await canSeeStudent(req.user, fee.student_id, ['school_admin']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (!amountOk(data, fee)) return res.json({ success: false, message: 'The amount paid does not cover this fee' });

    await pool.query(`UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1 AND status <> 'paid'`, [fee.id]);
    res.json({ success: true, data });
  } catch (err) {
    if (err.response && [400, 404].includes(err.response.status)) {
      return res.status(400).json({ error: 'Payment not found' });
    }
    res.status(500).json({ error: 'Could not verify the payment' });
  }
});

// Webhook handler
router.post('/webhook', async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.status(500).send('Not configured');
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Unauthorized');

    const event = req.body;
    if (event.event === 'charge.success' && event.data) {
      const fee_id = event.data.metadata && event.data.metadata.fee_id;
      const fee = validId(fee_id) ? await getFee(fee_id) : null;
      if (fee && amountOk(event.data, fee)) {
        await pool.query(`UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1 AND status <> 'paid'`, [fee.id]);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

module.exports = router;
