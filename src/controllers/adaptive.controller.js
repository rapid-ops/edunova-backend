const m = require('../models/adaptive.model');
const update = async (req, res) => { try { const { student_id, course_id, score } = req.body; if (!student_id || !course_id || score === undefined) return res.status(400).json({ error: 'student_id, course_id, score required' }); const profile = await m.upsert({ student_id, course_id, score }); res.json({ profile }); } catch (err) { res.status(500).json({ error: err.message }); } };
const get = async (req, res) => { try { const profile = await m.get(req.params.student_id, req.params.course_id); res.json({ profile: profile || { difficulty_level: 5, avg_score: 0, attempts: 0 } }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { update, get };
