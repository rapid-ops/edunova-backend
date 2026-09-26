const m = require('../models/ticket.model');
const create = async (req, res) => { try { const t = await m.create(req.body); res.status(201).json({ ticket: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const listBySchool = async (req, res) => { try { const tickets = await m.getBySchool(req.params.school_id); res.json({ tickets }); } catch (err) { res.status(500).json({ error: err.message }); } };
const listByUser = async (req, res) => { try { const tickets = await m.getByUser(req.params.user_id); res.json({ tickets }); } catch (err) { res.status(500).json({ error: err.message }); } };
const updateStatus = async (req, res) => { try { const t = await m.updateStatus(req.params.id, req.body.status); res.json({ ticket: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const reply = async (req, res) => { try { const r = await m.addReply(req.body); res.status(201).json({ reply: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
const replies = async (req, res) => { try { const r = await m.getReplies(req.params.ticket_id); res.json({ replies: r }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, listBySchool, listByUser, updateStatus, reply, replies };
