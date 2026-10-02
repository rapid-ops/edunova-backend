const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

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
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = v => Math.max(0, Math.min(10000000, parseInt(v, 10) || 0));
const pick = (k, v, d) => (L[k].includes(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
const https = v => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(v) ? v : '');
const yt = v => (typeof v === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com)\/embed\/[\w-]+$/.test(v) ? v : '');

function clean(t = {}) {
  const s = t.sections || {}, c = s.content || {}, st = c.stats || {};
  const sections = {};
  SECS.forEach(k => { sections[k] = s[k] !== false; });
  sections.content = {
    hero_cta: str(c.hero_cta, 40) || 'Join this school',
    hero_image: https(c.hero_image),
    video_url: yt(c.video_url),
    stats: { students: num(st.students), courses: num(st.courses), teachers: num(st.teachers), years: num(st.years) },
    testimonials: (Array.isArray(c.testimonials) ? c.testimonials : []).slice(0, 12)
      .map(x => ({ quote: str(x && x.quote, 400), name: str(x && x.name, 80), role: str(x && x.role, 80) })).filter(x => x.quote),
    faq: (Array.isArray(c.faq) ? c.faq : []).slice(0, 20)
      .map(x => ({ q: str(x && x.q, 200), a: str(x && x.a, 800) })).filter(x => x.q),
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

router.get('/public', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, subdomain, logo_url, tagline, primary_color FROM schools ORDER BY name ASC LIMIT 500');
    res.json({ schools: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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
    res.json({ school: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
