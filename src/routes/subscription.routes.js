const router = require('express').Router();
const axios = require('axios');
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const PLANS = {
  basic: { name: 'Basic', amount: 5000, description: 'Up to 100 students' },
  standard: { name: 'Standard', amount: 15000, description: 'Up to 500 students' },
  premium: { name: 'Premium', amount: 30000, description: 'Unlimited students' },
};

// Get subscription status
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM subscriptions WHERE school_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.school_id]
    );
    const sub = result.rows[0];
    if (!sub) return res.json({ status: 'none', plans: PLANS });

    const now = new Date();
    const trialEnds = new Date(sub.trial_ends_at);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;

    let status = sub.status;
    if (status === 'trial' && now > trialEnds) status = 'expired';
    if (status === 'active' && periodEnd && now > periodEnd) status = 'expired';

    res.json({ subscription: { ...sub, status }, plans: PLANS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize subscription payment
router.post('/subscribe', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { school_id, plan, email } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

  try {
    const amount = PLANS[plan].amount * 100; // kobo

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount,
        metadata: { school_id, plan, type: 'subscription' },
        callback_url: `${process.env.FRONTEND_URL}/subscription/verify`,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify subscription payment
router.get('/verify/:reference', protect, async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${req.params.reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const data = response.data.data;
    if (data.status === 'success') {
      const { school_id, plan } = data.metadata;
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await pool.query(
        `INSERT INTO subscriptions (school_id, plan, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', $3, $4)
         ON CONFLICT DO NOTHING`,
        [school_id, plan, now, periodEnd]
      );

      await pool.query(
        `UPDATE schools SET subscription_plan=$1 WHERE id=$2`,
        [plan, school_id]
      );

      res.json({ success: true, plan });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel subscription
router.post('/cancel/:school_id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE subscriptions SET status='cancelled' WHERE school_id=$1`,
      [req.params.school_id]
    );
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
