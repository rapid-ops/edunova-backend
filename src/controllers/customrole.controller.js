const pool = require('../config/db');
const m = require('../models/customrole.model');
const { validId, sameSchool, getUser, schoolOfRow, schoolForCreate } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });

const cleanPerms = (p) =>
  Array.isArray(p) && p.length <= 50 && p.every((x) => typeof x === 'string' && x.length >= 1 && x.length <= 50) ? p : null;

const create = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const permissions = req.body.permissions === undefined ? [] : cleanPerms(req.body.permissions);
    if (!permissions) return res.status(400).json({ error: 'permissions must be a list of short text values' });
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const r = await m.create({ school_id, name: String(name).trim().slice(0, 100), permissions });
    res.status(201).json({ role: r });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ roles: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const update = async (req, res) => {
  try {
    const s = await schoolOfRow('custom_roles', req.params.id);
    if (!s) return res.status(404).json({ error: 'Role not found' });
    if (!sameSchool(req.user, s.school_id)) return res.status(403).json({ error: 'Access denied' });
    const cur = (await pool.query(`SELECT name, permissions FROM custom_roles WHERE id=$1`, [s.id])).rows[0];
    const name = req.body.name === undefined ? cur.name : String(req.body.name).trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'name cannot be empty' });
    const permissions = req.body.permissions === undefined ? cur.permissions : cleanPerms(req.body.permissions);
    if (!permissions) return res.status(400).json({ error: 'permissions must be a list of short text values' });
    res.json({ role: await m.update(s.id, { name, permissions }) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const s = await schoolOfRow('custom_roles', req.params.id);
    if (!s) return res.status(404).json({ error: 'Role not found' });
    if (!sameSchool(req.user, s.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(s.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

const assign = async (req, res) => {
  try {
    const { user_id, role_id } = req.body;
    if (!validId(user_id) || !validId(role_id)) return res.status(400).json({ error: 'user_id and role_id required' });
    const role = await schoolOfRow('custom_roles', role_id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (!sameSchool(req.user, role.school_id)) return res.status(403).json({ error: 'Access denied' });
    const user = await getUser(user_id);
    if (!user || Number(user.school_id) !== Number(role.school_id)) return res.status(404).json({ error: 'User not found in this school' });
    await m.assignToUser(user.id, role.id);
    res.json({ message: 'Assigned' });
  } catch (err) { fail(res, err); }
};

const userRoles = async (req, res) => {
  try {
    const target = await getUser(req.params.user_id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const own = Number(req.user.id) === Number(target.id);
    const admin = ['school_admin', 'super_admin'].includes(req.user.role) && sameSchool(req.user, target.school_id);
    if (!own && !admin) return res.status(403).json({ error: 'Access denied' });
    res.json({ roles: await m.getUserRoles(target.id) });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, update, remove, assign, userRoles };
