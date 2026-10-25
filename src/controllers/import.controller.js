const { parse } = require('csv-parse/sync');
const pool = require('../config/db');
const { normPhone } = require('../utils/phone');
const { validId, schoolForCreate } = require('../utils/access');
const { sendEmail } = require('../services/email.service');
const m = require('../models/people.model');

const MAX_ROWS = 500;
const CHUNK = 25;
const ROLES = ['student', 'teacher', 'parent'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALIAS = { name: 'full_name', fullname: 'full_name', class_name: 'class' };
const oops = (res) => res.status(500).json({ error: 'Something went wrong. Please try again.' });
const norm = (h) => String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
class RowError extends Error { constructor(msg) { super(msg); this.friendly = msg; } }

const scope = (req, res, src) => {
  if (req.user.role === 'super_admin') {
    if (!validId(src.school_id)) { res.status(400).json({ error: 'Choose a school first.' }); return null; }
    return Number(src.school_id);
  }
  if (req.user.school_id == null) { res.status(403).json({ error: 'You do not have access to this school.' }); return null; }
  return req.user.school_id;
};

const importPeople = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a CSV file to import.' });
    if (req.user.role === 'super_admin' && !validId(req.body && req.body.school_id)) return res.status(400).json({ error: 'Choose a school first.' });
    const school_id = schoolForCreate(req, res);
    if (school_id == null) return;
    const preset = ROLES.includes(req.body && req.body.role) ? req.body.role : null;
    let rows;
    try {
      rows = parse(req.file.buffer.toString('utf8'), {
        columns: (h) => h.map((x) => { const n = norm(x); return ALIAS[n] || n; }),
        skip_empty_lines: true, trim: true, bom: true, relax_column_count: true,
      });
    } catch (e) { return res.status(400).json({ error: 'We could not read this file. Save it as a CSV (comma separated) and try again.' }); }
    if (!rows.length) return res.status(400).json({ error: 'The file has no rows to import.' });
    if (rows.length > MAX_ROWS) return res.status(400).json({ error: `This file has ${rows.length} rows. You can import up to ${MAX_ROWS} people at a time. Split the file and import it in parts.` });
    if (!('full_name' in rows[0])) return res.status(400).json({ error: 'The first row must contain the column names. Download the template to see how it should look.' });

    const errors = [];
    const seen = new Map();
    const todo = [];
    rows.forEach((raw, i) => {
      const line = i + 2;
      const full_name = clean(raw.full_name);
      const email = clean(raw.email).toLowerCase();
      const label = full_name || email || `Line ${line}`;
      const fail = (reason) => errors.push({ row: label, line, reason });
      const role = clean(raw.role || preset || '').toLowerCase();
      if (!ROLES.includes(role)) return fail(role ? 'The role must be student, teacher or parent.' : 'Add a role: student, teacher or parent.');
      if (full_name.length < 2 || full_name.length > 100) return fail('Enter the full name (2 to 100 characters).');
      if (!email && role === 'parent') return fail('Parents need an email address.');
      if (email && (!EMAIL.test(email) || email.length > 254 || email.endsWith('@no-email.invalid'))) return fail('The email address is not valid.');
      let phone = null;
      if (clean(raw.phone)) { phone = normPhone(clean(raw.phone)); if (!phone) return fail('The phone number is not a valid Nigerian number.'); }
      let parent_email = null;
      let parent_phone = null;
      if (role === 'student' && clean(raw.parent_email)) {
        parent_email = clean(raw.parent_email).toLowerCase();
        if (!EMAIL.test(parent_email) || parent_email.length > 254) return fail('The parent email address is not valid.');
        if (parent_email === email) return fail('The parent needs a different email from the student.');
        if (clean(raw.parent_phone)) { parent_phone = normPhone(clean(raw.parent_phone)); if (!parent_phone) return fail('The parent phone number is not a valid Nigerian number.'); }
      }
      if (email) {
        if (seen.has(email)) return fail(`This email already appears on line ${seen.get(email)} of the file.`);
        seen.set(email, line);
      }
      todo.push({ line, label, role, full_name, email: email || null, phone, parent_email, parent_phone, parent_name: clean(raw.parent_name) || null });
    });

    const lookup = [...new Set(todo.flatMap((v) => [v.email, v.parent_email]).filter(Boolean))];
    const known = new Map();
    if (lookup.length) {
      const r = await pool.query('SELECT lower(email) AS e, school_id, role, full_name FROM users WHERE lower(email) = ANY($1)', [lookup]);
      r.rows.forEach((x) => known.set(x.e, x));
    }
    const ready = [];
    for (const v of todo) {
      const me = v.email && known.get(v.email);
      if (me) { errors.push({ row: v.label, line: v.line, reason: Number(me.school_id) === Number(school_id) ? `${me.full_name} is already in this school with this email.` : 'This email is already registered.' }); continue; }
      const pe = v.parent_email && known.get(v.parent_email);
      if (pe && Number(pe.school_id) !== Number(school_id)) { errors.push({ row: v.label, line: v.line, reason: 'The parent email is already registered.' }); continue; }
      if (pe && pe.role !== 'parent') { errors.push({ row: v.label, line: v.line, reason: 'The parent email belongs to someone in your school who is not a parent.' }); continue; }
      ready.push(v);
    }

    const sign_ins = [];
    let created = 0;
    for (let i = 0; i < ready.length; i += CHUNK) {
      const slice = ready.slice(i, i + CHUNK);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [school_id, 7]);
        const okRows = [];
        for (const v of slice) {
          await client.query('SAVEPOINT r');
          try {
            const main = await m.insertPerson(client, { school_id, role: v.role, full_name: v.full_name, email: v.email, phone: v.phone, cost: 8 });
            if (v.parent_email) {
              const pr = await m.attachParent(client, school_id, main.user.id, { full_name: v.parent_name || `Parent of ${v.full_name}`, email: v.parent_email, phone: v.parent_phone }, 8);
              if (pr.error) throw new RowError(pr.error === 'other' ? 'The parent email is already registered.' : 'The parent email belongs to someone in your school who is not a parent.');
            }
            await client.query('RELEASE SAVEPOINT r');
            okRows.push({ v, main });
          } catch (e) {
            await client.query('ROLLBACK TO SAVEPOINT r');
            console.error('import row failed', e.code || e.friendly || 'error');
            errors.push({ row: v.label, line: v.line, reason: e.friendly || (e.code === '23505' ? 'This email is already registered.' : 'This row could not be saved. Check it and try again.') });
          }
        }
        await client.query('COMMIT');
        for (const { v, main } of okRows) {
          created++;
          if (main.code) sign_ins.push({ full_name: v.full_name, role: v.role, login_id: main.login_id, code: main.code, expires_at: main.expires_at });
        }
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
        console.error('import chunk failed', e.code || 'error');
        slice.forEach((v) => errors.push({ row: v.label, line: v.line, reason: 'This row could not be saved because of a temporary problem. Import it again.' }));
      } finally { client.release(); }
    }

    errors.sort((a, b) => a.line - b.line);
    res.json({
      total: rows.length, created, failed: errors.length, errors, sign_ins,
      pending_invites: await m.pendingCount(school_id),
      ignored: 'class' in rows[0] ? ['class'] : [],
    });
  } catch (e) { console.error('import failed', e.code || 'error'); oops(res); }
};

const pendingInvites = async (req, res) => {
  try {
    const school_id = scope(req, res, req.query);
    if (school_id == null) return;
    res.json({ pending: await m.pendingCount(school_id) });
  } catch (e) { oops(res); }
};

const sendInvites = async (req, res) => {
  try {
    const school_id = scope(req, res, req.body || {});
    if (school_id == null) return;
    const batch = await m.pendingList(school_id, 20);
    const school = await m.schoolName(school_id);
    let sent = 0;
    let failed = 0;
    for (const p of batch) {
      let ok = false;
      try {
        const r = await m.reinvite({ ...p, status: 'invited' });
        ok = (await sendEmail(p.email, 'invite', { name: p.full_name, school_name: school, link: r.link })) === true;
      } catch (e) { ok = false; }
      try { await m.markEmailed(p.id, ok); } catch (e) { /* ignore */ }
      if (ok) sent++; else failed++;
      await wait(600);
    }
    res.json({ sent, failed, remaining: await m.pendingCount(school_id) });
  } catch (e) { oops(res); }
};

module.exports = { importPeople, pendingInvites, sendInvites };
