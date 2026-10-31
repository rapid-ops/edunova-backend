const pool = require('../config/db');

// Used only the first time, to fill an empty billing_plans table with what was charged before
const DEFAULTS = [
  { key: 'basic', name: 'Basic', price: 5000, max_users: 100, period: 1, sort: 1,
    features: ['Core LMS', 'Courses and lessons', 'Student and teacher accounts'] },
  { key: 'standard', name: 'Standard', price: 15000, max_users: 500, period: 1, sort: 2,
    features: ['Everything in Basic', 'Parent portal', 'Analytics', 'WhatsApp notifications'] },
  { key: 'premium', name: 'Premium', price: 30000, max_users: null, period: 1, sort: 3,
    features: ['Everything in Standard', 'AI Tutor', 'Blockchain certificates', 'Priority support'] },
];

let ready = null;
const ensure = () => {
  if (ready) return ready;
  ready = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS billing_plans (
      plan_key VARCHAR(30) PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      price_ngn INTEGER NOT NULL DEFAULT 0,
      max_users INTEGER,
      period_months INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      features JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount INTEGER');
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM billing_plans');
    if (!n.rows[0].n) {
      for (const d of DEFAULTS) {
        await pool.query(
          `INSERT INTO billing_plans (plan_key, name, price_ngn, max_users, period_months, features, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (plan_key) DO NOTHING`,
          [d.key, d.name, d.price, d.max_users, d.period, JSON.stringify(d.features), d.sort]);
      }
    }
    await pool.query(
      `UPDATE subscriptions s SET amount = bp.price_ngn FROM billing_plans bp
       WHERE s.amount IS NULL AND s.paystack_reference IS NOT NULL AND bp.plan_key = s.plan`);
  })().catch((e) => { ready = null; console.log('billing setup:', e.message); throw e; });
  return ready;
};
ensure().catch(() => {});

const shape = (r) => ({
  key: r.plan_key,
  name: r.name,
  amount: r.price_ngn,
  price_ngn: r.price_ngn,
  max_users: r.max_users,
  period_months: r.period_months,
  description: r.description || '',
  features: Array.isArray(r.features) ? r.features : [],
  is_active: r.is_active,
  sort_order: r.sort_order,
});

const getPlans = async (activeOnly) => {
  await ensure();
  const r = await pool.query(
    `SELECT * FROM billing_plans ${activeOnly ? 'WHERE is_active' : ''} ORDER BY sort_order, price_ngn, plan_key`);
  return r.rows.map(shape);
};

const getPlansMap = async (activeOnly) => {
  const out = {};
  (await getPlans(activeOnly)).forEach((p) => { out[p.key] = p; });
  return out;
};

module.exports = { ensure, getPlans, getPlansMap, shape };
