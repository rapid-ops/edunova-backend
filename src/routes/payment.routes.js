const router = require('express').Router();
const axios = require('axios');
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Initialize payment
router.post('/initialize', protect, async (req, res) => {
  const { fee_id, email, amount } = req.body;
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: amount * 100, // Convert to kobo
        metadata: { fee_id },
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );
    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify payment
router.get('/verify/:reference', protect, async (req, res) => {
  const { reference } = req.params;
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      }
    );
    const data = response.data.data;
    if (data.status === 'success') {
      const fee_id = data.metadata?.fee_id;
      if (fee_id) {
        await pool.query(
          `UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1`,
          [fee_id]
        );
      }
      res.json({ success: true, data });
    } else {
      res.json({ success: false, message: 'Payment not successful' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler
router.post('/webhook', async (req, res) => {
  const hash = require('crypto')
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Unauthorized');
  }

  const event = req.body;
  if (event.event === 'charge.success') {
    const fee_id = event.data.metadata?.fee_id;
    if (fee_id) {
      await pool.query(
        `UPDATE fees SET status='paid', paid_at=NOW() WHERE id=$1`,
        [fee_id]
      );
    }
  }
  res.sendStatus(200);
});

module.exports = router;
