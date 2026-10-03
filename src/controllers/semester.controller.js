const m = require('../models/semester.model');
const { validId, sameSchool, schoolOfRow } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });
const okDate = (v) => v === undefined || v === null || v === '' || !Number.isNaN(Date.parse(v));

const create = async (req, res) => {
  try {
    const { batch_id, name, start_date, end_date } = req.body;
    if (!validId(batch_id) || !name || !String(name).trim()) return res.status(400).json({ error: 'batch_id and name required' });
    if (!okDate(start_date) || !okDate(end_date)) return res.status(400).json({ error: 'Invalid date' });
    const b = await schoolOfRow('batches', batch_id);
    if (!b) return res.status(404).json({ error: 'Batch not found' });
    if (!sameSchool(req.user, b.school_id)) return res.status(403).json({ error: 'Access denied' });
    const s = await m.create({ school_id: b.school_id, batch_id: b.id, name: String(name).trim().slice(0, 255), start_date: start_date || null, end_date: end_date || null });
    res.status(201).json({ semester: s });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    const b = await schoolOfRow('batches', req.params.batch_id);
    if (!b) return res.status(404).json({ error: 'Batch not found' });
    if (!sameSchool(req.user, b.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ semesters: await m.getByBatch(b.id) });
  } catch (err) { fail(res, err); }
};

const activate = async (req, res) => {
  try {
    const s = await schoolOfRow('semesters', req.params.id);
    if (!s) return res.status(404).json({ error: 'Semester not found' });
    if (!sameSchool(req.user, s.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ semester: await m.setActive(s.id, s.school_id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const s = await schoolOfRow('semesters', req.params.id);
    if (!s) return res.status(404).json({ error: 'Semester not found' });
    if (!sameSchool(req.user, s.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(s.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, activate, remove };
