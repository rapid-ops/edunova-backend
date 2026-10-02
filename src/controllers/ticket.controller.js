const pool = require('../config/db');
const m = require('../models/ticket.model');
const { validId, sameSchool, getUser } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });
const ADMIN = ['super_admin', 'school_admin'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const loadTicket = async (req, res, id) => {
  if (!validId(id)) { res.status(404).json({ error: 'Ticket not found' }); return null; }
  const r = await pool.query(`SELECT id, school_id, user_id FROM tickets WHERE id=$1`, [id]);
  const t = r.rows[0];
  if (!t) { res.status(404).json({ error: 'Ticket not found' }); return null; }
  const own = Number(req.user.id) === Number(t.user_id);
  if (!sameSchool(req.user, t.school_id) || !(ADMIN.includes(req.user.role) || own)) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return t;
};

const create = async (req, res) => {
  try {
    const { subject, body, priority } = req.body;
    if (!subject || !String(subject).trim() || !body || !String(body).trim()) {
      return res.status(400).json({ error: 'subject and body required' });
    }
    const pr = priority === undefined || priority === null || priority === '' ? 'medium' : priority;
    if (!PRIORITIES.includes(pr)) return res.status(400).json({ error: 'Invalid priority' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const t = await m.create({
      school_id, user_id: req.user.id,
      subject: String(subject).trim().slice(0, 255), body: String(body).slice(0, 5000), priority: pr,
    });
    res.status(201).json({ ticket: t });
  } catch (err) { fail(res, err); }
};

const listBySchool = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ tickets: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const listByUser = async (req, res) => {
  try {
    const target = await getUser(req.params.user_id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const own = Number(req.user.id) === Number(target.id);
    if (!own && !(ADMIN.includes(req.user.role) && sameSchool(req.user, target.school_id))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ tickets: await m.getByUser(target.id) });
  } catch (err) { fail(res, err); }
};

const updateStatus = async (req, res) => {
  try {
    const t = await loadTicket(req, res, req.params.id);
    if (!t) return;
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    res.json({ ticket: await m.updateStatus(t.id, req.body.status) });
  } catch (err) { fail(res, err); }
};

const reply = async (req, res) => {
  try {
    const t = await loadTicket(req, res, req.body.ticket_id);
    if (!t) return;
    const body = typeof req.body.body === 'string' ? req.body.body.trim().slice(0, 5000) : '';
    if (!body) return res.status(400).json({ error: 'body required' });
    res.status(201).json({ reply: await m.addReply({ ticket_id: t.id, user_id: req.user.id, body }) });
  } catch (err) { fail(res, err); }
};

const replies = async (req, res) => {
  try {
    const t = await loadTicket(req, res, req.params.ticket_id);
    if (!t) return;
    res.json({ replies: await m.getReplies(t.id) });
  } catch (err) { fail(res, err); }
};

module.exports = { create, listBySchool, listByUser, updateStatus, reply, replies };
