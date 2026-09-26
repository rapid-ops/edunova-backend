const m = require('../models/skillpassport.model');
const get = async (req, res) => { try { const p = await m.getOrCreate(req.params.student_id); res.json({ passport: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const sync = async (req, res) => { try { const p = await m.sync(req.params.student_id); res.json({ passport: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const addExternal = async (req, res) => { try { const p = await m.addExternal(req.params.student_id, req.body); res.json({ passport: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const verify = async (req, res) => { try { const p = await m.getByPassportId(req.params.passport_id); if (!p) return res.status(404).json({ error: 'Passport not found' }); res.json({ passport: p, valid: true }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { get, sync, addExternal, verify };
