const m = require('../models/dropout.model');
const predict = async (req, res) => { try { const predictions = await m.predict(req.params.school_id); res.json({ predictions }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const predictions = await m.getBySchool(req.params.school_id); res.json({ predictions }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { predict, list };
