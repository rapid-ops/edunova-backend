const m = require('../models/discussion.model');
const create = async (req, res) => { try { const { lesson_id, school_id, user_id, parent_id, content } = req.body; if (!lesson_id||!school_id||!user_id||!content) return res.status(400).json({ error: 'lesson_id, school_id, user_id, content required' }); const d = await m.create({ lesson_id, school_id, user_id, parent_id, content }); res.status(201).json({ discussion: d }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const discussions = await m.getByLesson(req.params.lesson_id); res.json({ discussions }); } catch (err) { res.status(500).json({ error: err.message }); } };
const upvote = async (req, res) => { try { const result = await m.upvote(req.params.id, req.body.user_id); res.json(result); } catch (err) { res.status(500).json({ error: err.message }); } };
const pin = async (req, res) => { try { const d = await m.pin(req.params.id); res.json({ discussion: d }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { create, list, upvote, pin, remove };
