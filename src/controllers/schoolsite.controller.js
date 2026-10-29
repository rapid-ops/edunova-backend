const crypto = require('crypto');
const pool = require('../config/db');
const R = require('../services/siteRender');

const FRONT = String(process.env.FRONTEND_URL || 'https://edunova-frontend-gkaj.vercel.app').replace(/\/+$/, '');
const fail = (res, err) => {
  console.error('schoolsite error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const csp = (nonce) => [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src https: data:',
  "script-src 'nonce-" + nonce + "'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
].join('; ');
const sendPage = (res, html, nonce, maxAge) => {
  res.status(200).set({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp(nonce),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'public, max-age=' + maxAge,
  }).send(html);
};
const notPublished = (res) => res.status(404).set({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'X-Content-Type-Options': 'nosniff',
}).send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not published</title></head><body><p>This school has not published a website yet.</p></body></html>');

const schoolIdFor = (req, res) => {
  if (req.user.role === 'super_admin') {
    const v = (req.body && req.body.school_id) || req.query.school_id;
    if (!/^\d+$/.test(String(v || ''))) { res.status(400).json({ error: 'Choose a school first.' }); return null; }
    return Number(v);
  }
  if (req.user.school_id == null) { res.status(403).json({ error: 'Access denied' }); return null; }
  return Number(req.user.school_id);
};

const defaultsFor = async (sid) => {
  const sr = await pool.query('SELECT * FROM schools WHERE id=$1', [sid]);
  const s = sr.rows[0];
  if (!s) return null;
  const c = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM users u WHERE u.school_id=$1 AND u.role='student' AND u.approval_status='approved') AS students,
            (SELECT COUNT(*)::int FROM users u WHERE u.school_id=$1 AND u.role='teacher' AND u.approval_status='approved') AS teachers`, [sid]);
  const fields = {
    school_name: s.name || '', tagline: s.tagline || '', logo_url: s.logo_url || '', primary_color: s.primary_color || '',
    email: s.email || '', phone: s.phone || '', address: s.address || '',
    student_count: c.rows[0].students ? String(c.rows[0].students) : '', teacher_count: c.rows[0].teachers ? String(c.rows[0].teachers) : '',
    login_url: FRONT + '/login', apply_url: FRONT + '/register?school=' + (s.subdomain || ''),
    footer_text: s.name ? s.name + '. All rights reserved.' : '',
  };
  return { fields, lists: {}, subdomain: s.subdomain };
};

const templates = (req, res) => res.json({ templates: R.list() });

const templateSchema = (req, res) => {
  const t = R.schema(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Style not found' });
  res.json({ template: t });
};

const templatePreview = (req, res) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const html = R.render(req.params.slug, R.sample(req.params.slug), { nonce });
  if (!html) return notPublished(res);
  sendPage(res, html, nonce, 300);
};

const mine = async (req, res) => {
  try {
    const sid = schoolIdFor(req, res); if (!sid) return;
    const d = await defaultsFor(sid);
    if (!d) return res.status(404).json({ error: 'School not found' });
    const r = await pool.query(
      `SELECT template_slug, draft, published_slug, published_at, updated_at, (published IS NOT NULL) AS is_published
       FROM school_sites WHERE school_id=$1`, [sid]);
    res.json({ site: r.rows[0] || null, defaults: { fields: d.fields, lists: d.lists }, subdomain: d.subdomain });
  } catch (err) { fail(res, err); }
};

const save = async (req, res) => {
  try {
    const sid = schoolIdFor(req, res); if (!sid) return;
    const slug = String((req.body && req.body.template_slug) || '');
    if (!R.schema(slug)) return res.status(400).json({ error: 'Choose a website style first.' });
    const data = R.clean(slug, req.body.data);
    await pool.query(
      `INSERT INTO school_sites (school_id, template_slug, draft, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (school_id) DO UPDATE SET template_slug=$2, draft=$3, updated_at=NOW()`,
      [sid, slug, JSON.stringify(data)]);
    res.json({ site: { template_slug: slug, draft: data } });
  } catch (err) { fail(res, err); }
};

const preview = (req, res) => {
  try {
    const slug = String((req.body && req.body.template_slug) || '');
    const html = R.render(slug, req.body && req.body.data);
    if (!html) return res.status(400).json({ error: 'Choose a website style first.' });
    res.json({ html });
  } catch (err) { fail(res, err); }
};

const publish = async (req, res) => {
  try {
    const sid = schoolIdFor(req, res); if (!sid) return;
    const r = await pool.query('SELECT template_slug, draft FROM school_sites WHERE school_id=$1', [sid]);
    if (!r.rows[0]) return res.status(400).json({ error: 'Choose a style and save your details first.' });
    const slug = r.rows[0].template_slug;
    const data = R.clean(slug, r.rows[0].draft);
    if (!data || !data.fields.school_name) return res.status(400).json({ error: 'Add your school name before you publish.' });
    if (!R.render(slug, data)) return res.status(400).json({ error: 'This style cannot be published. Choose another style.' });
    await pool.query('UPDATE school_sites SET published=$2, published_slug=$3, published_at=NOW() WHERE school_id=$1', [sid, JSON.stringify(data), slug]);
    const s = await pool.query('SELECT subdomain FROM schools WHERE id=$1', [sid]);
    res.json({ published: true, subdomain: s.rows[0] ? s.rows[0].subdomain : null });
  } catch (err) { fail(res, err); }
};

const unpublish = async (req, res) => {
  try {
    const sid = schoolIdFor(req, res); if (!sid) return;
    await pool.query('UPDATE school_sites SET published=NULL, published_slug=NULL, published_at=NULL WHERE school_id=$1', [sid]);
    res.json({ published: false });
  } catch (err) { fail(res, err); }
};

const siteFor = async (subdomain) => {
  if (!/^[a-z0-9-]{1,63}$/i.test(String(subdomain))) return null;
  const r = await pool.query(
    `SELECT ss.published, ss.published_slug FROM school_sites ss JOIN schools s ON s.id=ss.school_id
     WHERE s.subdomain=$1 AND s.is_active=true AND ss.published IS NOT NULL`, [subdomain]);
  return r.rows[0] || null;
};

const publicInfo = async (req, res) => {
  try {
    const site = await siteFor(req.params.subdomain);
    res.set('Cache-Control', 'public, max-age=30').json({ published: !!site, template: site ? site.published_slug : null });
  } catch (err) { fail(res, err); }
};

const publicPage = async (req, res) => {
  try {
    const site = await siteFor(req.params.subdomain);
    if (!site) return notPublished(res);
    const nonce = crypto.randomBytes(16).toString('hex');
    const html = R.render(site.published_slug, site.published, { nonce });
    if (!html) return notPublished(res);
    sendPage(res, html, nonce, 30);
  } catch (err) { fail(res, err); }
};

module.exports = { templates, templateSchema, templatePreview, mine, save, preview, publish, unpublish, publicInfo, publicPage };
