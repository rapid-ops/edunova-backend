const m = require('../models/announcement.model');
const create = async (req, res) => { try { const a = await m.create(req.body); res.status(201).json({ announcement: a }); } catch (err) { res.status(500).json({ error: err.message }); } };
const forStudent = async (req, res) => { try { const a = await m.getForStudent(req.params.student_id, req.params.school_id); res.json({ announcements: a }); } catch (err) { res.status(500).json({ error: err.message }); } };
const forTeacher = async (req, res) => { try { const a = await m.getForTeacher(req.params.teacher_id, req.params.school_id); res.json({ announcements: a }); } catch (err) { res.status(500).json({ error: err.message }); } };
const bySchool = async (req, res) => { try { const a = await m.getBySchool(req.params.school_id); res.json({ announcements: a }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, forStudent, forTeacher, bySchool, remove };
