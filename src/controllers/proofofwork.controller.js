const m = require('../models/proofofwork.model');
const createTask = async (req, res) => { try { const t = await m.createTask(req.body); res.status(201).json({ task: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const listTasks = async (req, res) => { try { const tasks = await m.getTasksByCourse(req.params.course_id); res.json({ tasks }); } catch (err) { res.status(500).json({ error: err.message }); } };
const submit = async (req, res) => { try { const s = await m.submit(req.body); res.status(201).json({ submission: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const review = async (req, res) => { try { const s = await m.review(req.body); res.json({ submission: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const listSubmissions = async (req, res) => { try { const s = await m.getSubmissions(req.params.task_id); res.json({ submissions: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const studentSubmissions = async (req, res) => { try { const s = await m.getStudentSubmissions(req.params.student_id); res.json({ submissions: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { createTask, listTasks, submit, review, listSubmissions, studentSubmissions };
