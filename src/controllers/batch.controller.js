const m = require('../models/batch.model');
const create = async (req, res) => { try { const b = await m.create(req.body); res.status(201).json({ batch: b }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const batches = await m.getByProgram(req.params.program_id); res.json({ batches }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, remove };
