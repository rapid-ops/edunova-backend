const m = require('../models/learningtwin.model');
const get = async (req, res) => { try { const t = await m.getOrCreate({ student_id: req.params.student_id, school_id: req.query.school_id }); res.json({ twin: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const analyze = async (req, res) => { try { const t = await m.analyze(req.params.student_id); res.json({ twin: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { get, analyze };
