const m = require('../models/department.model');
const { log } = require('../models/auditlog.model');
const create = async (req, res) => { try { const d = await m.create(req.body); await log({ school_id: req.body.school_id, user_id: req.user.id, action: 'CREATE_DEPARTMENT', entity: 'department', entity_id: d.id }); res.status(201).json({ department: d }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const deps = await m.getBySchool(req.params.school_id); res.json({ departments: deps }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, remove };
