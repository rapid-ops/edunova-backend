const m = require('../models/program.model');
const create = async (req, res) => { try { const p = await m.create(req.body); res.status(201).json({ program: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const programs = await m.getByDepartment(req.params.department_id); res.json({ programs }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, remove };
