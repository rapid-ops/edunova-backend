const m = require('../models/customrole.model');
const create = async (req, res) => { try { const r = await m.create(req.body); res.status(201).json({ role: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const roles = await m.getBySchool(req.params.school_id); res.json({ roles }); } catch (err) { res.status(500).json({ error: err.message }); } };
const update = async (req, res) => { try { const r = await m.update(req.params.id, req.body); res.json({ role: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const assign = async (req, res) => { try { await m.assignToUser(req.body.user_id, req.body.role_id); res.json({ message: 'Assigned' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const userRoles = async (req, res) => { try { const roles = await m.getUserRoles(req.params.user_id); res.json({ roles }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, update, remove, assign, userRoles };
