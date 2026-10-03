const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

pool.query('CREATE TABLE IF NOT EXISTS school_theme_drafts (school_id INTEGER PRIMARY KEY, config JSONB, updated_at TIMESTAMPTZ DEFAULT NOW())').catch(e => console.log('drafts table:', e.message));

const HEX = /^#[0-9a-fA-F]{6}$/;
const L = {
  template: ['modern', 'bold', 'minimal', 'vibrant', 'professional', 'african'],
  font: ['inter', 'jakarta', 'sora', 'poppins', 'merriweather', 'dmsans'],
  hero_style: ['centered', 'split', 'fullscreen', 'video', 'illustrated'],
  card_style: ['rounded', 'sharp', 'floating', 'glass', 'bordered'],
  radius: ['sharp', 'soft', 'round'],
  button_style: ['filled', 'outlined', 'ghost'],
};
const SECS = ['hero', 'stats', 'features', 'courses', 'testimonials', 'teachers', 'faq', 'contact', 'footer'];
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = v => Math.max(0, Math.min(10000000, parseInt(v, 10) || 0));
const pick = (k, v, d) => (L[k].includes(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const https = v => (typeof v === 'string' && /^https:\/\/[^\s"'<>()]{1,500}$/.test(v) ? v : '');
const yt = v => (typeof v === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[\w-]+$/.test(v) ? v : '');
const date = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

function cleanProgrammes(p) {
  const out = {};
  const src = p && typeof p === 'object' ? p : {};
  Object.keys(src).slice(0, 200).forEach(k => {
    if (!/^\d{1,10}$/.test(k)) return;
    const v = src[k] || {};
    const o = { duration: str(v.duration, 80), fees: str(v.fees, 80), requirements: str(v.requirements, 600) };
    if (o.duration || o.fees || o.requirements) out[k] = o;
  });
  return out;
}

function clean(t = {}) {
  const s = t.sections || {}, c = s.content || {}, st = c.stats || {};
  const sections = {};
  SECS.forEach(k => { sections[k] = s[k] !== false; });
  sections.content = {
    hero_cta: str(c.hero_cta, 40) || 'Apply now',
    hero_image: https(c.hero_image),
    video_url: yt(c.video_url),
    about: str(c.about, 3000),
    admissions: str(c.admissions, 2000),
    stats: { students: num(st.students), courses: num(st.courses), teachers: num(st.teachers), years: num(st.years) },
    testimonials: arr(c.testimonials, 12)
      .map(x => ({ quote: str(x && x.quote, 400), name: str(x && x.name, 80), role: str(x && x.role, 80) })).filter(x => x.quote),
    faq: arr(c.faq, 20)
      .map(x => ({ q: str(x && x.q, 200), a: str(x && x.a, 800) })).filter(x => x.q),
    news: arr(c.news, 30)
      .map(x => ({ title: str(x && x.title, 150), date: date(x && x.date), body: str(x && x.body, 3000), image: https(x && x.image) })).filter(x => x.title),
    events: arr(c.events, 30)
      .map(x => ({ title: str(x && x.title, 150), date: date(x && x.date), place: str(x && x.place, 120) })).filter(x => x.title),
    staff: arr(c.staff, 40)
      .map(x => ({ name: str(x && x.name, 80), role: str(x && x.role, 100), photo: https(x && x.photo), bio: str(x && x.bio, 500) })).filter(x => x.name),
    gallery: arr(c.gallery, 40)
      .map(x => ({ url: https(x && x.url), caption: str(x && x.caption, 120) })).filter(x => x.url),
    programmes: cleanProgrammes(c.programmes),
  };
  return {
    template: pick('template', t.template, 'modern'),
    primary_color: hex(t.primary_color, '#2563eb'),
    secondary_color: hex(t.secondary_color, '#10b981'),
    font: pick('font', t.font, 'inter'),
    hero_style: pick('hero_style', t.hero_style, 'centered'),
    card_style: pick('card_style', t.card_style, 'rounded'),
    radius: pick('radius', t.radius, 'soft'),
    button_style: pick('button_style', t.button_style, 'filled'),
    background: hex(t.background, '#ffffff'),
    sections,
  };
}

const own = (req, res, next) => {
  const u = req.user || {};
  if (u.role === 'super_admin' || (u.school_id && String(u.school_id) === String(req.params.id))) return next();
  res.status(403).json({ error: 'Not your school' });
};

router.put('/:id/website', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    const { external_website_url, website_config } = req.body;
    const r = await pool.query('UPDATE schools SET external_website_url=$1, website_config=$2 WHERE id=$3 RETURNING *', [external_website_url, website_config, req.params.id]);
    res.json({ school: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/theme', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    const tagline = typeof req.body.tagline === 'string' ? req.body.tagline.slice(0, 160) : null;
    const logo = req.body.logo_url ? https(req.body.logo_url) || null : null;
    const r = await pool.query(
      'UPDATE schools SET theme_config=$1::jsonb, tagline=COALESCE($2,tagline), logo_url=COALESCE($3,logo_url) WHERE id=$4 RETURNING id,name,tagline,logo_url,theme_config',
      [JSON.stringify(clean(req.body.theme_config)), tagline, logo, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'School not found' });
    await pool.query('DELETE FROM school_theme_drafts WHERE school_id=$1', [req.params.id]).catch(() => {});
    res.json({ school: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/draft', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    const r = await pool.query('SELECT config, updated_at FROM school_theme_drafts WHERE school_id=$1', [req.params.id]);
    res.json({ draft: r.rows[0] ? r.rows[0].config : null, updated_at: r.rows[0] ? r.rows[0].updated_at : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/draft', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    const config = {
      theme_config: clean(req.body.theme_config),
      tagline: typeof req.body.tagline === 'string' ? req.body.tagline.slice(0, 160) : '',
      logo_url: https(req.body.logo_url),
    };
    await pool.query(
      'INSERT INTO school_theme_drafts (school_id, config, updated_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (school_id) DO UPDATE SET config=EXCLUDED.config, updated_at=NOW()',
      [req.params.id, JSON.stringify(config)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/draft', protect, authorize('super_admin', 'school_admin'), own, async (req, res) => {
  try {
    await pool.query('DELETE FROM school_theme_drafts WHERE school_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
