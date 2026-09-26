const m = require('../models/transcript.model');
const generate = async (req, res) => { try { const t = await m.generate(req.body); if (!t) return res.status(400).json({ error: 'No grades found' }); res.status(201).json({ transcript: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const transcripts = await m.getByStudent(req.params.student_id); res.json({ transcripts }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { generate, list };
