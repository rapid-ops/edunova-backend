const m = require('../models/semester.model');
const create = async (req, res) => { try { const s = await m.create(req.body); res.status(201).json({ semester: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const semesters = await m.getByBatch(req.params.batch_id); res.json({ semesters }); } catch (err) { res.status(500).json({ error: err.message }); } };
const activate = async (req, res) => { try { const s = await m.setActive(req.params.id, req.body.school_id); res.json({ semester: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, activate, remove };
