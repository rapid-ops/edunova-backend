const m = require('../models/gradebook.model');
const upsert = async (req, res) => { try { const g = await m.upsert(req.body); res.json({ grade: g }); } catch (err) { res.status(500).json({ error: err.message }); } };
const studentGrades = async (req, res) => { try { const grades = await m.getStudentGrades(req.params.student_id, req.params.course_id); res.json({ grades }); } catch (err) { res.status(500).json({ error: err.message }); } };
const courseGradebook = async (req, res) => { try { const grades = await m.getCourseGradebook(req.params.course_id); res.json({ grades }); } catch (err) { res.status(500).json({ error: err.message }); } };
const gpa = async (req, res) => { try { const data = await m.getGPA(req.params.student_id, req.params.school_id); res.json(data); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { upsert, studentGrades, courseGradebook, gpa };
