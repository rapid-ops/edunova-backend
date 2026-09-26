const m = require('../models/b2bticket.model');
const create = async (req, res) => { try { const t = await m.create(req.body); res.status(201).json({ ticket: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const bySchool = async (req, res) => { try { const tickets = await m.getBySchool(req.params.school_id); res.json({ tickets }); } catch (err) { res.status(500).json({ error: err.message }); } };
const all = async (req, res) => { try { const tickets = await m.getAll(); res.json({ tickets }); } catch (err) { res.status(500).json({ error: err.message }); } };
const reply = async (req, res) => { try { const t = await m.reply({ id: req.params.id, super_admin_reply: req.body.super_admin_reply, replied_by: req.body.replied_by }); res.json({ ticket: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
const updateStatus = async (req, res) => { try { const t = await m.updateStatus(req.params.id, req.body.status); res.json({ ticket: t }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, bySchool, all, reply, updateStatus };
