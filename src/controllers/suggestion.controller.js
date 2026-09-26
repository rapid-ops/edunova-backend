const m = require('../models/suggestion.model');
const create = async (req, res) => { try { const { school_id, role, content } = req.body; if (!school_id || !role || !content) return res.status(400).json({ error: 'school_id, role, content required' }); const s = await m.create({ school_id, role, content }); res.status(201).json({ suggestion: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const suggestions = await m.getBySchool(req.params.school_id); res.json({ suggestions }); } catch (err) { res.status(500).json({ error: err.message }); } };
const reply = async (req, res) => { try { const s = await m.reply(req.params.id, req.body.admin_reply); res.json({ suggestion: s }); } catch (err) { res.status(500).json({ error: err.message }); } };
const markRead = async (req, res) => { try { await m.markRead(req.params.id); res.json({ message: 'Marked read' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, reply, markRead };
