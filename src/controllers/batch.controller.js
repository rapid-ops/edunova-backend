const m = require('../models/batch.model');
const { validId, sameSchool, schoolOfRow } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });
const okDate = (v) => v === undefined || v === null || v === '' || !Number.isNaN(Date.parse(v));

const create = async (req, res) => {
  try {
    const { program_id, name, start_date, end_date } = req.body;
    if (!validId(program_id) || !name || !String(name).trim()) return res.status(400).json({ error: 'program_id and name required' });
    if (!okDate(start_date) || !okDate(end_date)) return res.status(400).json({ error: 'Invalid date' });
    const p = await schoolOfRow('programs', program_id);
    if (!p) return res.status(404).json({ error: 'Program not found' });
    if (!sameSchool(req.user, p.school_id)) return res.status(403).json({ error: 'Access denied' });
    const b = await m.create({ school_id: p.school_id, program_id: p.id, name: String(name).trim().slice(0, 255), start_date: start_date || null, end_date: end_date || null });
    res.status(201).json({ batch: b });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    const p = await schoolOfRow('programs', req.params.program_id);
    if (!p) return res.status(404).json({ error: 'Program not found' });
    if (!sameSchool(req.user, p.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ batches: await m.getByProgram(p.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const b = await schoolOfRow('batches', req.params.id);
    if (!b) return res.status(404).json({ error: 'Batch not found' });
    if (!sameSchool(req.user, b.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(b.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, remove };
