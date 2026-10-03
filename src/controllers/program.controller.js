const m = require('../models/program.model');
const { validId, sameSchool, schoolOfRow } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });

const create = async (req, res) => {
  try {
    const { department_id, name } = req.body;
    if (!validId(department_id) || !name || !String(name).trim()) return res.status(400).json({ error: 'department_id and name required' });
    const d = await schoolOfRow('departments', department_id);
    if (!d) return res.status(404).json({ error: 'Department not found' });
    if (!sameSchool(req.user, d.school_id)) return res.status(403).json({ error: 'Access denied' });
    const p = await m.create({ school_id: d.school_id, department_id: d.id, name: String(name).trim().slice(0, 255) });
    res.status(201).json({ program: p });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    const d = await schoolOfRow('departments', req.params.department_id);
    if (!d) return res.status(404).json({ error: 'Department not found' });
    if (!sameSchool(req.user, d.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ programs: await m.getByDepartment(d.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const p = await schoolOfRow('programs', req.params.id);
    if (!p) return res.status(404).json({ error: 'Program not found' });
    if (!sameSchool(req.user, p.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(p.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, remove };
