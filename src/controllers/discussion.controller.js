const m = require('../models/discussion.model');
const post = async (req, res) => { try { const { lesson_id, course_id, school_id, user_id, parent_id, content } = req.body; if (!lesson_id || !user_id || !content) return res.status(400).json({ error: 'lesson_id, user_id, content required' }); const d = await m.create({ lesson_id, course_id, school_id, user_id, parent_id, content }); res.status(201).json({ discussion: d }); } catch (err) { res.status(500).json({ error: err.message }); } };
const list = async (req, res) => { try { const rows = await m.getByLesson(req.params.lesson_id); res.json({ discussions: rows }); } catch (err) { res.status(500).json({ error: err.message }); } };
const upvote = async (req, res) => { try { const result = await m.upvote(req.params.id, req.body.user_id); res.json(result); } catch (err) { res.status(500).json({ error: err.message }); } };
const pin = async (req, res) => { try { await m.pin(req.params.id); res.json({ message: 'Toggled pin' }); } catch (err) { res.status(500).json({ error: err.message }); } };
const remove = async (req, res) => { try { await m.remove(req.params.id); res.json({ message: 'Deleted' }); } catch (err) { res.status(500).json({ error: err.message }); } };
module.exports = { post, list, upvote, pin, remove };
