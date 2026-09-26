const m = require('../models/courseassignment.model');
const assign = async (req, res) => { try { const a = await m.assign(req.body); res.status(201).json({ assignment: a }); } catch (err) { res.status(500).json({ error: err.message }); } };
const unassign = async (req, res) => { try { await m.unassign(req.params.course_id, req.params.teacher_id); res.json({ message: 'Unassigned' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byTeacher = async (req, res) => { try { const courses = await m.getByTeacher(req.params.teacher_id); res.json({ courses }); } catch (err) { res.status(500).json({ error: err.message }); } };
const bySchool = async (req, res) => { try { const assignments = await m.getBySchool(req.params.school_id); res.json({ assignments }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byCourse = async (req, res) => { try { const teachers = await m.getByCourse(req.params.course_id); res.json({ teachers }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { assign, unassign, byTeacher, bySchool, byCourse };
