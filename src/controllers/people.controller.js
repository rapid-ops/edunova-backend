const { validId, sameSchool, schoolForCreate } = require('../utils/access');
const { normPhone } = require('../utils/phone');
const { sendEmail } = require('../services/email.service');
const m = require('../models/people.model');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const oops = (res) => res.status(500).json({ error: 'Something went wrong. Please try again.' });
const bad = (res, errors, message) => res.status(400).json({ error: message || 'Please correct the highlighted fields.', errors });
const cleanName = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const cleanEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const validEmail = (e) => EMAIL.test(e) && e.length <= 254 && !e.endsWith('@no-email.invalid');

const readPerson = (b, emailRequired, prefix) => {
  const errors = {};
  const k = (f) => (prefix || '') + f;
  const full_name = cleanName(b && b.full_name);
  const email = cleanEmail(b && b.email);
  const rawPhone = b && b.phone != null ? String(b.phone).trim() : '';
  if (full_name.length < 2 || full_name.length > 100) errors[k('full_name')] = 'Enter the full name.';
  if (!email) { if (emailRequired) errors[k('email')] = 'Enter an email address.'; }
  else if (!validEmail(email)) errors[k('email')] = 'Enter a valid email address.';
  let phone = null;
  if (rawPhone) {
    phone = normPhone(rawPhone);
    if (!phone) errors[k('phone')] = 'Enter a valid Nigerian phone number, for example 0803 123 4567.';
  }
  return { errors, v: { full_name, email: email || null, phone } };
};

const sendInvite = async (u, school, link) => {
  let emailed = false;
  try { emailed = (await sendEmail(u.email, 'invite', { name: u.full_name, school_name: school, link })) === true; } catch (e) { emailed = false; }
  if (emailed && u.id) { try { await m.markEmailed(u.id, true); } catch (e) { /* ignore */ } }
  return { link, emailed };
};

const scope = (req, res, src) => {
  if (req.user.role === 'super_admin') {
    if (!validId(src.school_id)) { res.status(400).json({ error: 'Choose a school first.' }); return null; }
    return Number(src.school_id);
  }
  if (req.user.school_id == null) { res.status(403).json({ error: 'You do not have access to this school.' }); return null; }
  return req.user.school_id;
};

const loadTarget = async (req, res) => {
  const id = req.params.id;
  if (!validId(id)) { res.status(404).json({ error: 'That person could not be found.' }); return null; }
  const p = await m.getOne(id);
  if (!p || !m.ROLES.includes(p.role)) { res.status(404).json({ error: 'That person could not be found.' }); return null; }
  if (!sameSchool(req.user, p.school_id)) { res.status(403).json({ error: 'You do not have access to this person.' }); return null; }
  return p;
};

const list = async (req, res) => {
  try {
    const school_id = scope(req, res, req.query);
    if (school_id == null) return;
    res.json(await m.list(school_id, req.query));
  } catch (e) { oops(res); }
};

const create = async (req, res) => {
  try {
    if (req.user.role === 'super_admin' && !validId(req.body && req.body.school_id)) return res.status(400).json({ error: 'Choose a school first.' });
    const school_id = schoolForCreate(req, res);
    if (school_id == null) return;
    const b = req.body || {};
    if (!m.ROLES.includes(b.role)) return bad(res, { role: 'Choose student, teacher or parent.' }, 'You can add students, teachers and parents here.');
    const { errors, v } = readPerson(b, b.role === 'parent', '');
    let parent = null;
    if (b.role === 'student' && b.parent && typeof b.parent === 'object' && (b.parent.full_name || b.parent.email || b.parent.phone)) {
      const pr = readPerson(b.parent, true, 'parent_');
      Object.assign(errors, pr.errors);
      parent = pr.v;
    }
    if (parent && v.email && parent.email === v.email) errors.parent_email = 'The parent needs a different email from the student.';
    if (Object.keys(errors).length) return bad(res, errors);
    const out = await m.createPerson({ school_id, role: b.role, ...v, parent });
    if (out.duplicate === 'same') {
      return res.status(409).json({ error: `${out.existing.full_name} is already in this school.`, existing: { id: out.existing.id, full_name: out.existing.full_name, role: out.existing.role } });
    }
    if (out.duplicate) return res.status(409).json({ error: 'This email is already registered.' });
    if (out.parentError === 'other') return res.status(409).json({ error: 'This email is already registered.', errors: { parent_email: 'This email is already registered.' } });
    if (out.parentError) return res.status(409).json({ error: 'That email belongs to someone in your school who is not a parent.', errors: { parent_email: 'That email belongs to someone who is not a parent.' } });
    const school = await m.schoolName(school_id);
    const result = { person: out.main.user, sign_in: null, invitation: null, parent: null };
    if (out.main.code) result.sign_in = { login_id: out.main.login_id, code: out.main.code, expires_at: out.main.expires_at, school_name: school };
    if (out.main.link) result.invitation = await sendInvite(out.main.user, school, out.main.link);
    if (out.parent) {
      result.parent = { id: out.parent.id, full_name: out.parent.full_name, created: out.parent.created, linked: true, invitation: null };
      if (out.parent.link) result.parent.invitation = await sendInvite({ id: out.parent.id, full_name: out.parent.full_name, email: out.parent.email }, school, out.parent.link);
    }
    res.status(201).json(result);
  } catch (e) { oops(res); }
};

const detail = async (req, res) => {
  try {
    const p = await loadTarget(req, res);
    if (!p) return;
    res.json({ person: await m.detail(p) });
  } catch (e) { oops(res); }
};

const update = async (req, res) => {
  try {
    const p = await loadTarget(req, res);
    if (!p) return;
    const b = req.body || {};
    const errors = {};
    const fields = {};
    if ('full_name' in b) {
      const n = cleanName(b.full_name);
      if (n.length < 2 || n.length > 100) errors.full_name = 'Enter the full name.'; else fields.full_name = n;
    }
    if ('phone' in b) {
      const raw = b.phone == null ? '' : String(b.phone).trim();
      if (!raw) fields.phone = null;
      else {
        const ph = normPhone(raw);
        if (!ph) errors.phone = 'Enter a valid Nigerian phone number, for example 0803 123 4567.'; else fields.phone = ph;
      }
    }
    if ('email' in b && cleanEmail(b.email) !== (p.email || '')) errors.email = 'Email addresses cannot be changed here yet.';
    if (Object.keys(errors).length) return bad(res, errors);
    if (!(await m.updatePerson(p.id, fields))) return res.status(400).json({ error: 'There is nothing to change.' });
    res.json({ person: await m.getOne(p.id) });
  } catch (e) { oops(res); }
};

const invite = async (req, res) => {
  try {
    const p = await loadTarget(req, res);
    if (!p) return;
    if (p.status === 'suspended') return res.status(400).json({ error: 'Reactivate this account before sending a new invitation.' });
    if (p.status === 'pending') return res.status(400).json({ error: 'Approve this account first.' });
    const school = await m.schoolName(p.school_id);
    const r = await m.reinvite(p);
    if (r.code) return res.json({ sign_in: { login_id: r.login_id, code: r.code, expires_at: r.expires_at, school_name: school } });
    res.json({ invitation: await sendInvite(p, school, r.link) });
  } catch (e) { oops(res); }
};

const linkParent = async (req, res) => {
  try {
    const p = await loadTarget(req, res);
    if (!p) return;
    if (p.role !== 'student') return res.status(400).json({ error: 'Parents can only be linked to students.' });
    const b = req.body || {};
    let input;
    if (b.parent_id != null) {
      if (!validId(b.parent_id)) return bad(res, { parent_id: 'Choose a parent.' });
      input = { parent_id: Number(b.parent_id) };
    } else if (b.parent && typeof b.parent === 'object') {
      const pr = readPerson(b.parent, true, 'parent_');
      if (Object.keys(pr.errors).length) return bad(res, pr.errors);
      input = { parent: pr.v };
    } else return bad(res, { parent_id: 'Choose a parent or enter their details.' });
    const out = await m.linkParent(p, input);
    if (out.error === 'notfound') return res.status(404).json({ error: 'That parent could not be found.' });
    if (out.error === 'forbidden') return res.status(403).json({ error: 'You do not have access to this person.' });
    if (out.error === 'other') return res.status(409).json({ error: 'This email is already registered.', errors: { parent_email: 'This email is already registered.' } });
    if (out.error) return res.status(409).json({ error: 'That email belongs to someone in your school who is not a parent.' });
    const result = { parent: { id: out.id, full_name: out.full_name, created: out.created, linked: true, invitation: null } };
    if (out.link) result.parent.invitation = await sendInvite({ id: out.id, full_name: out.full_name, email: out.email }, await m.schoolName(p.school_id), out.link);
    res.status(out.created ? 201 : 200).json(result);
  } catch (e) { oops(res); }
};

const unlinkParent = async (req, res) => {
  try {
    const p = await loadTarget(req, res);
    if (!p) return;
    if (!validId(req.params.parent_id)) return res.status(404).json({ error: 'That parent could not be found.' });
    const par = await m.getOne(req.params.parent_id);
    if (!par || par.role !== 'parent') return res.status(404).json({ error: 'That parent could not be found.' });
    if (!sameSchool(req.user, par.school_id)) return res.status(403).json({ error: 'You do not have access to this person.' });
    await m.unlinkParent(par.id, p.id);
    res.json({ message: 'Parent unlinked.' });
  } catch (e) { oops(res); }
};

module.exports = { list, create, detail, update, invite, linkParent, unlinkParent };
