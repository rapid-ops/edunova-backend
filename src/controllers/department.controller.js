const pool = require('../config/db');
const m = require('../models/department.model');
const { log } = require('../models/auditlog.model');
const { validId, sameSchool } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const d = await m.create({ school_id, name: String(name).trim().slice(0, 255) });
    try { await log({ school_id, user_id: req.user.id, action: 'CREATE_DEPARTMENT', entity: 'department', entity_id: d.id }); } catch (e) { console.error('Audit log failed:', e.message); }
    res.status(201).json({ department: d });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ departments: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Department not found' });
    const r = await pool.query(`SELECT id, school_id FROM departments WHERE id=$1`, [req.params.id]);
    const d = r.rows[0];
    if (!d) return res.status(404).json({ error: 'Department not found' });
    if (!sameSchool(req.user, d.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(d.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, remove };
