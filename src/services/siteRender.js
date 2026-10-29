const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'templates', 'website');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const cache = {};
let slugCache = null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const plain = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const asDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plain(v, 10));
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return '';
  return +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
};

// Every value is checked by its field type before it is saved or shown.
const cleanValue = (f, v) => {
  switch (f.type) {
    case 'image': case 'url': { const s = plain(v, 500); return /^https:\/\/[^\s"'<>`\\]+$/i.test(s) ? s : ''; }
    case 'color': { const s = plain(v, 7); return /^#[0-9a-f]{6}$/i.test(s) ? s : (f.default || ''); }
    case 'phone': {
      if (f.key === 'whatsapp') { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length >= 7 && d.length <= 15 ? d : ''; }
      const s = plain(v, 25); return /^\+?[0-9][0-9 ()-]{4,23}$/.test(s) ? s : '';
    }
    case 'email': { const s = plain(v, 120); return /^[^\s@"'<>]+@[^\s@"'<>]+\.[A-Za-z]{2,}$/.test(s) ? s : ''; }
    case 'number': return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 7);
    case 'date': return asDate(v) ? plain(v, 10) : '';
    case 'textarea': return plain(v, f.key === 'address' ? 300 : 2000);
    default: return plain(v, 160);
  }
};

const MARK = /<!--(IF|ENDIF|EACH|ENDEACH):([a-z0-9_.]+)-->/g;
const parse = (html) => {
  const root = { kids: [] };
  const stack = [root];
  let last = 0, m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(html))) {
    const top = stack[stack.length - 1];
    if (m.index > last) top.kids.push({ t: html.slice(last, m.index) });
    last = MARK.lastIndex;
    const kind = m[1], key = m[2];
    if (kind === 'IF' || kind === 'EACH') { const n = { kind, key, kids: [] }; top.kids.push(n); stack.push(n); }
    else if (stack.length < 2 || top.kind !== (kind === 'ENDIF' ? 'IF' : 'EACH') || top.key !== key) throw new Error('Template markers do not match at ' + key);
    else stack.pop();
  }
  if (stack.length !== 1) throw new Error('Template has an unclosed marker');
  if (last < html.length) root.kids.push({ t: html.slice(last) });
  return root;
};

const slugs = () => {
  if (!slugCache) slugCache = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(DIR, d.name, 'template.json'))).map((d) => d.name).sort();
  return slugCache;
};
const load = (slug) => {
  if (!/^[a-z0-9-]+$/.test(String(slug)) || !slugs().includes(slug)) return null;
  if (!cache[slug]) {
    const meta = JSON.parse(fs.readFileSync(path.join(DIR, slug, 'template.json'), 'utf8'));
    cache[slug] = { meta, tree: parse(fs.readFileSync(path.join(DIR, slug, 'index.html'), 'utf8')) };
  }
  return cache[slug];
};

const list = () => slugs().map((slug) => {
  const m = load(slug).meta;
  const d = (k) => (m.fields.find((x) => x.key === k) || {}).default || '';
  return { slug, name: m.name, description: m.description, primary_color: d('primary_color'), accent_color: d('accent_color') };
});
const schema = (slug) => { const t = load(slug); return t ? { slug, name: t.meta.name, description: t.meta.description, fields: t.meta.fields, lists: t.meta.lists || [] } : null; };

// Input looks like { fields: {...}, lists: { staff: [{...}] } }. Output is the safe version.
const clean = (slug, input) => {
  const t = load(slug);
  if (!t) return null;
  const src = input && typeof input === 'object' ? input : {};
  const sf = src.fields && typeof src.fields === 'object' ? src.fields : {};
  const sl = src.lists && typeof src.lists === 'object' ? src.lists : {};
  const fields = {};
  t.meta.fields.forEach((f) => { fields[f.key] = cleanValue(f, sf[f.key]); });
  const lists = {};
  (t.meta.lists || []).forEach((l) => {
    const rows = Array.isArray(sl[l.key]) ? sl[l.key] : [];
    lists[l.key] = rows.slice(0, l.max || 8).map((it) => {
      const o = {};
      l.fields.forEach((f) => { o[f.key] = cleanValue(f, it && it[f.key]); });
      return o;
    }).filter((o) => Object.values(o).some(Boolean));
  });
  return { fields, lists };
};

const out = (nodes, c) => nodes.map((n) => {
  if (n.t !== undefined) {
    return n.t.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/g, (_, k) => {
      const item = k.startsWith('item.');
      const raw = item ? (c.item ? c.item[k.slice(5)] : '') : c.fields[k];
      if (raw == null) return '';
      const type = item ? (c.itemTypes || {})[k.slice(5)] : c.types[k];
      return esc(type === 'date' ? asDate(raw) : raw);
    });
  }
  if (n.kind === 'IF') {
    const item = n.key.startsWith('item.');
    const v = item ? (c.item ? c.item[n.key.slice(5)] : '') : (c.lists[n.key] ? c.lists[n.key].length : c.fields[n.key]);
    return v !== undefined && v !== null && String(v) !== '' && v !== 0 ? out(n.kids, c) : '';
  }
  const types = c.listTypes[n.key] || {};
  return (c.lists[n.key] || []).map((item) => out(n.kids, { ...c, item, itemTypes: types })).join('');
}).join('');

const render = (slug, input, opts) => {
  const t = load(slug);
  if (!t) return null;
  const d = clean(slug, input);
  const types = {}, listTypes = {};
  t.meta.fields.forEach((f) => { types[f.key] = f.type; });
  (t.meta.lists || []).forEach((l) => { listTypes[l.key] = {}; l.fields.forEach((f) => { listTypes[l.key][f.key] = f.type; }); });
  let html = out(t.tree.kids, { fields: d.fields, lists: d.lists, types, listTypes });
  html = html.replace(/<title>([^<]*?)\s*\|\s*<\/title>/, '<title>$1</title>');
  const nonce = opts && opts.nonce;
  if (nonce) html = html.replace(/<script(?=[\s>])/g, () => '<script nonce="' + nonce + '"');
  html = html.replace(/<a\s([^>]*?)href="(https?:\/\/[^"]*)"([^>]*)>/gi, (m, a, h, b) => (/\btarget\s*=/i.test(a + ' ' + b) ? m : '<a ' + a + 'href="' + h + '" target="_blank" rel="noopener noreferrer"' + b + '>'));
  return html;
};

const sample = (slug) => ({
  fields: { school_name: 'Greenfield Academy', tagline: 'Learning that lasts a lifetime', about_text: 'A friendly school where every child is known by name and encouraged to grow.', mission: 'To help every learner grow in knowledge, character and confidence.', address: '12 School Road, Abeokuta, Ogun State', phone: '+234 801 234 5678', email: 'info@greenfield.example.com', whatsapp: '2348012345678', facebook_url: 'https://facebook.com/greenfield', instagram_url: 'https://instagram.com/greenfield', year_founded: '1998', student_count: '420', teacher_count: '28', apply_url: 'https://example.com/apply', login_url: 'https://example.com/login', footer_text: 'Greenfield Academy. All rights reserved.' },
  lists: {
    programs: [{ title: 'Primary', description: 'A caring start for ages 5 to 11.' }, { title: 'Junior Secondary', description: 'Building strong foundations.' }, { title: 'Senior Secondary', description: 'Preparing for WAEC and beyond.' }],
    staff: [{ name: 'Mrs A. Bello', role: 'Head of School' }, { name: 'Mr T. Okafor', role: 'Head of Science' }],
    testimonials: [{ name: 'A parent', text: 'My children love going to school every morning.' }],
    news: [{ title: 'Open day', date: '2026-11-20', summary: 'Come and meet our teachers.' }],
    gallery: [],
  },
});

module.exports = { list, schema, clean, render, sample, load };
