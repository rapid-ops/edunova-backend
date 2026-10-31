const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId } = require('../utils/access');
const { ensure, getPlans, getPlansMap, shape } = require('../utils/billing');

const owner = [protect, authorize('super_admin')];
const oops = (res, e) => { console.error('owner error:', e.message); res.status(500).json({ error: 'Something went wrong. Please try again.' }); };
const LIVE = `u.suspended_at IS NULL`;

// effective subscription state (a trial or paid period that has run out counts as expired)
const effective = (s) => {
  if (!s || !s.sub_status) return 'none';
  const now = Date.now();
  if (s.sub_status === 'trial' && s.trial_ends_at && now > new Date(s.trial_ends_at).getTime()) return 'expired';
  if (s.sub_status === 'active' && s.current_period_end && now > new Date(s.current_period_end).getTime()) return 'expired';
  return s.sub_status;
};

const SCHOOL_SQL = `SELECT s.id, s.name, s.email, s.subdomain, s.is_active, s.created_at, s.subscription_plan,
    (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='student' AND ${LIVE}) AS students,
    (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='teacher' AND ${LIVE}) AS teachers,
    (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='parent' AND ${LIVE}) AS parents,
    (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='school_admin' AND ${LIVE}) AS admins,
    (SELECT u.email FROM users u WHERE u.school_id=s.id AND u.role='school_admin' ORDER BY u.id LIMIT 1) AS admin_email,
    sub.status AS sub_status, sub.current_period_end, sub.trial_ends_at
  FROM schools s
  LEFT JOIN LATERAL (SELECT status, current_period_end, trial_ends_at FROM subscriptions x WHERE x.school_id=s.id ORDER BY x.created_at DESC LIMIT 1) sub ON true`;

const withUsage = (rows, plans) => rows.map((s) => {
  const total = s.students + s.teachers + s.parents + s.admins;
  const plan = plans[s.subscription_plan];
  const limit = plan ? plan.max_users : null;
  return {
    id: s.id, name: s.name, email: s.email, subdomain: s.subdomain, is_active: s.is_active, created_at: s.created_at,
    plan: s.subscription_plan, plan_name: plan ? plan.name : s.subscription_plan,
    students: s.students, teachers: s.teachers, parents: s.parents, admins: s.admins, total_users: total,
    user_limit: limit, over_limit: limit ? total > limit : false,
    admin_email: s.admin_email, subscription_status: effective(s), period_end: s.current_period_end || s.trial_ends_at || null,
  };
});

router.get('/overview', ...owner, async (req, res) => {
  try {
    await ensure();
    const plans = await getPlansMap(false);
    const q = (sql) => pool.query(sql);
    const [tot, subs, rev, months, recent, tickets] = await Promise.all([
      q(`SELECT (SELECT COUNT(*)::int FROM schools) AS schools,
                (SELECT COUNT(*)::int FROM schools WHERE is_active) AS active_schools,
                (SELECT COUNT(*)::int FROM schools WHERE created_at > NOW() - INTERVAL '30 days') AS new_schools_30d,
                (SELECT COUNT(*)::int FROM users u WHERE u.role='student' AND ${LIVE}) AS students,
                (SELECT COUNT(*)::int FROM users u WHERE u.role='teacher' AND ${LIVE}) AS teachers,
                (SELECT COUNT(*)::int FROM users u WHERE u.role='parent' AND ${LIVE}) AS parents,
                (SELECT COUNT(*)::int FROM users u WHERE u.role='school_admin' AND ${LIVE}) AS admins,
                (SELECT COUNT(*)::int FROM b2b_tickets WHERE status='open') AS open_tickets`),
      q(`SELECT s.id, sub.status AS sub_status, sub.current_period_end, sub.trial_ends_at
         FROM schools s LEFT JOIN LATERAL (SELECT status, current_period_end, trial_ends_at FROM subscriptions x WHERE x.school_id=s.id ORDER BY x.created_at DESC LIMIT 1) sub ON true`),
      q(`SELECT COALESCE(SUM(amount),0)::bigint AS total,
                COALESCE(SUM(CASE WHEN date_trunc('month', created_at)=date_trunc('month', NOW()) THEN amount END),0)::bigint AS this_month
         FROM subscriptions WHERE paystack_reference IS NOT NULL`),
      q(`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, COALESCE(SUM(amount),0)::bigint AS amount
         FROM subscriptions WHERE paystack_reference IS NOT NULL AND created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
         GROUP BY 1 ORDER BY 1`),
      q(`${SCHOOL_SQL} ORDER BY s.created_at DESC LIMIT 5`),
      q(`SELECT t.id, t.subject, t.priority, t.created_at, sc.name AS school_name
         FROM b2b_tickets t LEFT JOIN schools sc ON sc.id=t.school_id WHERE t.status='open' ORDER BY t.created_at DESC LIMIT 5`),
    ]);
    const by = {};
    subs.rows.forEach((s) => { const k = effective(s); by[k] = (by[k] || 0) + 1; });
    const t = tot.rows[0];
    res.json({
      totals: { ...t, users: t.students + t.teachers + t.parents + t.admins },
      subscriptions: by,
      revenue: { total: Number(rev.rows[0].total), this_month: Number(rev.rows[0].this_month), months: months.rows.map((m) => ({ month: m.month, amount: Number(m.amount) })) },
      recent_schools: withUsage(recent.rows, plans),
      open_tickets: tickets.rows,
    });
  } catch (e) { oops(res, e); }
});

router.get('/schools', ...owner, async (req, res) => {
  try {
    const plans = await getPlansMap(false);
    const r = await pool.query(`${SCHOOL_SQL} ORDER BY s.created_at DESC`);
    res.json({ schools: withUsage(r.rows, plans), plans: Object.values(plans) });
  } catch (e) { oops(res, e); }
});

router.put('/schools/:id', ...owner, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'School not found' });
    if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Say whether the school should be active.' });
    const r = await pool.query('UPDATE schools SET is_active=$1 WHERE id=$2 RETURNING id, is_active', [req.body.is_active, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'School not found' });
    res.json({ school: r.rows[0] });
  } catch (e) { oops(res, e); }
});

// Give a school a plan without a payment (for example a gift or a bank transfer)
router.put('/schools/:id/plan', ...owner, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'School not found' });
    const plans = await getPlansMap(false);
    const plan = plans[req.body.plan];
    if (!plan) return res.status(400).json({ error: 'Choose a plan from the list.' });
    const s = await pool.query('SELECT id FROM schools WHERE id=$1', [req.params.id]);
    if (!s.rows[0]) return res.status(404).json({ error: 'School not found' });
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + (plan.period_months || 1));
    await pool.query(
      `INSERT INTO subscriptions (school_id, plan, status, current_period_start, current_period_end, amount)
       VALUES ($1,$2,'active',$3,$4,0)`, [req.params.id, plan.key, now, end]);
    await pool.query('UPDATE schools SET subscription_plan=$1 WHERE id=$2', [plan.key, req.params.id]);
    res.json({ message: 'Plan updated', plan: plan.key, period_end: end });
  } catch (e) { oops(res, e); }
});

// Billing rules
const cleanPlan = (b, partial) => {
  const out = {};
  if (!partial || b.name !== undefined) {
    const n = String(b.name || '').trim();
    if (!n || n.length > 60) return { error: 'Give the plan a name (up to 60 characters).' };
    out.name = n;
  }
  if (!partial || b.price_ngn !== undefined) {
    const p = Number(b.price_ngn);
    if (!Number.isInteger(p) || p < 0 || p > 50000000) return { error: 'The price must be a whole number of naira.' };
    out.price_ngn = p;
  }
  if (b.max_users !== undefined) {
    if (b.max_users === null || b.max_users === '') out.max_users = null;
    else {
      const m = Number(b.max_users);
      if (!Number.isInteger(m) || m < 1 || m > 1000000) return { error: 'The user limit must be a whole number, or empty for no limit.' };
      out.max_users = m;
    }
  }
  if (!partial || b.period_months !== undefined) {
    const m = Number(b.period_months);
    if (!Number.isInteger(m) || m < 1 || m > 36) return { error: 'The billing period must be between 1 and 36 months.' };
    out.period_months = m;
  }
  if (b.description !== undefined) out.description = String(b.description || '').slice(0, 300);
  if (b.features !== undefined) {
    if (!Array.isArray(b.features)) return { error: 'Features must be a list.' };
    out.features = JSON.stringify(b.features.map((f) => String(f).trim().slice(0, 120)).filter(Boolean).slice(0, 12));
  }
  if (b.is_active !== undefined) out.is_active = !!b.is_active;
  if (b.sort_order !== undefined) {
    const o = Number(b.sort_order);
    if (!Number.isInteger(o) || o < 0 || o > 1000) return { error: 'The order must be a small whole number.' };
    out.sort_order = o;
  }
  return { out };
};

router.get('/billing/plans', ...owner, async (req, res) => {
  try { res.json({ plans: await getPlans(false) }); } catch (e) { oops(res, e); }
});

router.post('/billing/plans', ...owner, async (req, res) => {
  try {
    await ensure();
    const key = String(req.body.key || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,30}$/.test(key)) return res.status(400).json({ error: 'The plan key must be 2 to 30 letters, numbers, - or _.' });
    const c = cleanPlan(req.body, false);
    if (c.error) return res.status(400).json({ error: c.error });
    const o = c.out;
    const ex = await pool.query('SELECT 1 FROM billing_plans WHERE plan_key=$1', [key]);
    if (ex.rows[0]) return res.status(400).json({ error: 'A plan with that key already exists.' });
    const last = await pool.query('SELECT COALESCE(MAX(sort_order),0)::int AS m FROM billing_plans');
    await pool.query(
      `INSERT INTO billing_plans (plan_key, name, price_ngn, max_users, period_months, description, features, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [key, o.name, o.price_ngn, o.max_users === undefined ? null : o.max_users, o.period_months, o.description || '', o.features || '[]', o.is_active === undefined ? true : o.is_active, o.sort_order === undefined ? last.rows[0].m + 1 : o.sort_order]);
    res.status(201).json({ plans: await getPlans(false) });
  } catch (e) { oops(res, e); }
});

router.put('/billing/plans/:key', ...owner, async (req, res) => {
  try {
    await ensure();
    const key = String(req.params.key || '');
    const cur = await pool.query('SELECT * FROM billing_plans WHERE plan_key=$1', [key]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Plan not found' });
    const c = cleanPlan(req.body, true);
    if (c.error) return res.status(400).json({ error: c.error });
    const keys = Object.keys(c.out);
    if (!keys.length) return res.json({ plans: await getPlans(false) });
    if (c.out.is_active === false) {
      const others = await pool.query('SELECT COUNT(*)::int AS n FROM billing_plans WHERE is_active AND plan_key<>$1', [key]);
      if (!others.rows[0].n) return res.status(400).json({ error: 'At least one plan must stay active.' });
    }
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).concat('updated_at=NOW()').join(', ');
    await pool.query(`UPDATE billing_plans SET ${sets} WHERE plan_key=$1`, [key, ...keys.map((k) => c.out[k])]);
    res.json({ plans: await getPlans(false) });
  } catch (e) { oops(res, e); }
});

module.exports = router;
