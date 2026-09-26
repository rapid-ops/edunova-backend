const m = require('../models/automation.model');
const create = async (req, res) => { try { const r = await m.create(req.body); res.status(201).json({ rule: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const rules = await m.getBySchool(req.params.school_id); res.json({ rules }); } catch (err) { res.status(500).json({ error: err.message }); } };
const toggle = async (req, res) => { try { const r = await m.toggle(req.params.id); res.json({ rule: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const trigger = async (req, res) => { try { const { school_id, trigger_event, student_id, value } = req.body; await m.evaluate(school_id, trigger_event, student_id, value); res.json({ message: 'Evaluated' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, toggle, remove, trigger };
