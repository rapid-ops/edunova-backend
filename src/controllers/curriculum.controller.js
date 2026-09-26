const m = require('../models/curriculum.model');
const create = async (req, res) => { try { const s = await m.create(req.body); res.status(201).json({ standard: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const standards = await m.getBySchool(req.params.school_id); res.json({ standards }); } catch (err) { res.status(500).json({ error: err.message }); } };
const link = async (req, res) => { try { await m.linkCourse(req.body.course_id, req.body.standard_id); res.json({ message: 'Linked' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byCourse = async (req, res) => { try { const standards = await m.getByCourse(req.params.course_id); res.json({ standards }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, link, byCourse, remove };
