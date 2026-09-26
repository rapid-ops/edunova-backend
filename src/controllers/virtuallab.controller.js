const m = require('../models/virtuallab.model');
const create = async (req, res) => { try { const l = await m.create(req.body); res.status(201).json({ lab: l }); } catch (err) { res.status(500).json({ error: err.message }); } };
const byCourse = async (req, res) => { try { const labs = await m.getByCourse(req.params.course_id); res.json({ labs }); } catch (err) { res.status(500).json({ error: err.message }); } };
const submit = async (req, res) => { try { const s = await m.submit(req.body); res.json({ submission: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const submissions = async (req, res) => { try { const s = await m.getSubmissions(req.params.lab_id); res.json({ submissions: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, byCourse, submit, submissions, remove };
