const m = require('../models/learningpath.model');
const createPath = async (req, res) => { try { const { school_id, title, description } = req.body; if (!school_id || !title) return res.status(400).json({ error: 'school_id and title required' }); const path = await m.create({ school_id, title, description }); res.status(201).json({ path }); } catch (err) { res.status(500).json({ error: err.message }); } };
const addCourse = async (req, res) => { try { const lpc = await m.addCourse(req.body); res.json({ lpc }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const paths = await m.getBySchool(req.params.school_id); res.json({ paths }); } catch (err) { res.status(500).json({ error: err.message }); } };
const get = async (req, res) => { try { const path = await m.getById(req.params.id); if (!path) return res.status(404).json({ error: 'Not found' }); res.json({ path }); } catch (err) { res.status(500).json({ error: err.message }); } };
const checkPrereq = async (req, res) => { try { const ok = await m.checkPrerequisite(req.params.student_id, req.params.course_id); res.json({ unlocked: ok }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { createPath, addCourse, list, get, checkPrereq, remove };
