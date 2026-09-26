const m = require('../models/scorm.model');
const create = async (req, res) => { try { const p = await m.createPackage(req.body); res.status(201).json({ package: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byCourse = async (req, res) => { try { const packages = await m.getByCourse(req.params.course_id); res.json({ packages }); } catch (err) { res.status(500).json({ error: err.message }); } };
const saveProgress = async (req, res) => { try { const p = await m.upsertProgress(req.body); res.json({ progress: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
const getProgress = async (req, res) => { try { const p = await m.getProgress(req.params.package_id, req.params.student_id); res.json({ progress: p }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, byCourse, saveProgress, getProgress };
