const router = require('express').Router();
const axios = require('axios');
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');
const { getPlans, getPlansMap } = require('../utils/billing');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

// Public: the plans a school can buy (set by the platform owner)
router.get('/plans', async (req, res) => {
  try {
    res.json({ plans: await getPlans(true) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load the plans' });
  }
});

// Get subscription status (own school only)
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const PLANS = await getPlansMap(true);
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

// Initialize subscription payment: school and email come from the login, amount from the plan
router.post('/subscribe', protect, authorize('super_admin', 'school_admin'), async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Payments are not set up yet' });
    const { plan } = req.body;
    const PLANS = await getPlansMap(true);
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (!(PLANS[plan].amount >= 100)) return res.status(400).json({ error: 'This plan cannot be bought online. Contact support.' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const u = await pool.query(`SELECT email FROM users WHERE id=$1`, [req.user.id]);
    const email = u.rows[0] && u.rows[0].email;
    if (!email) return res.status(400).json({ error: 'Your account has no email address' });

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: PLANS[plan].amount * 100,
        metadata: { school_id, plan, type: 'subscription', amount: PLANS[plan].amount },
        callback_url: `${process.env.FRONTEND_URL}/subscription/verify`,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({
      authorization_url: response.data.data.authorization_url,
      reference: response.data.data.reference,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not start the payment' });
  }
});

// Verify subscription payment: each paid reference can be used once
router.get('/verify/:reference', protect, authorize('super_admin', 'school_admin'), async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Payments are not set up yet' });
    const reference = req.params.reference;
    if (!/^[A-Za-z0-9_=-]{4,100}$/.test(reference)) return res.status(400).json({ error: 'Invalid reference' });
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const data = response.data.data;
    if (data.status !== 'success') return res.json({ success: false });

    const PLANS = await getPlansMap(false);
    const meta = data.metadata || {};
    const plan = meta.plan;
    if (meta.type !== 'subscription' || !PLANS[plan] || !validId(meta.school_id)) {
      return res.json({ success: false, message: 'This payment is not a subscription' });
    }
    if (!sameSchool(req.user, meta.school_id)) return res.status(403).json({ error: 'Access denied' });
    // The price agreed when the payment was started (the owner may change prices in between)
    const expected = Number(meta.amount) > 0 ? Number(meta.amount) : PLANS[plan].amount;
    if ((data.currency && data.currency !== 'NGN') || Number(data.amount) < expected * 100) {
      return res.json({ success: false, message: 'The amount paid does not cover this plan' });
    }

    const used = await pool.query(`SELECT 1 FROM subscriptions WHERE paystack_reference=$1`, [reference]);
    if (!used.rowCount) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + (PLANS[plan].period_months || 1));
      try {
        await pool.query(
          `INSERT INTO subscriptions (school_id, plan, status, current_period_start, current_period_end, paystack_reference, amount)
           VALUES ($1, $2, 'active', $3, $4, $5, $6)`,
          [meta.school_id, plan, now, periodEnd, reference, Math.round(Number(data.amount) / 100)]
        );
        await pool.query(`UPDATE schools SET subscription_plan=$1 WHERE id=$2`, [plan, meta.school_id]);
      } catch (e) {
        if (e.code !== '23505') throw e;
      }
    }
    res.json({ success: true, plan });
  } catch (err) {
    if (err.response && [400, 404].includes(err.response.status)) return res.status(400).json({ error: 'Payment not found' });
    res.status(500).json({ error: 'Could not verify the payment' });
  }
});

// Cancel subscription
router.post('/cancel/:school_id', protect, authorize('super_admin', 'school_admin'), async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(`UPDATE subscriptions SET status='cancelled' WHERE school_id=$1`, [req.params.school_id]);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
