const pool = require('../config/db');
const m = require('../models/discussion.model');
const { validId, sameSchool } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });
const STAFF = ['super_admin', 'school_admin', 'teacher'];

const lessonSchool = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(`SELECT l.id, c.school_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1`, [id]);
  return r.rows[0] || null;
};
const info = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(
    `SELECT d.id, d.lesson_id, d.user_id, c.school_id
     FROM discussions d JOIN lessons l ON l.id=d.lesson_id JOIN courses c ON c.id=l.course_id WHERE d.id=$1`, [id]
  );
  return r.rows[0] || null;
};
const loadInfo = async (req, res) => {
  const d = await info(req.params.id);
  if (!d) { res.status(404).json({ error: 'Post not found' }); return null; }
  if (!sameSchool(req.user, d.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return d;
};

const create = async (req, res) => {
  try {
    const { lesson_id, parent_id, content } = req.body;
    const text = typeof content === 'string' ? content.trim().slice(0, 2000) : '';
    if (!validId(lesson_id) || !text) return res.status(400).json({ error: 'lesson_id and content required' });
    const lesson = await lessonSchool(lesson_id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!sameSchool(req.user, lesson.school_id)) return res.status(403).json({ error: 'Access denied' });
    let parent = null;
    if (parent_id !== undefined && parent_id !== null && parent_id !== '') {
      const p = await info(parent_id);
      if (!p || Number(p.lesson_id) !== Number(lesson.id)) return res.status(400).json({ error: 'Reply target not found' });
      parent = p.id;
    }
    const d = await m.create({ lesson_id: lesson.id, school_id: lesson.school_id, user_id: req.user.id, parent_id: parent, content: text });
    res.status(201).json({ discussion: d });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    const lesson = await lessonSchool(req.params.lesson_id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!sameSchool(req.user, lesson.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ discussions: await m.getByLesson(lesson.id) });
  } catch (err) { fail(res, err); }
};

const upvote = async (req, res) => {
  try {
    const d = await loadInfo(req, res);
    if (!d) return;
    res.json(await m.upvote(d.id, req.user.id));
  } catch (err) { fail(res, err); }
};

const pin = async (req, res) => {
  try {
    const d = await loadInfo(req, res);
    if (!d) return;
    res.json({ discussion: await m.pin(d.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const d = await loadInfo(req, res);
    if (!d) return;
    if (!STAFF.includes(req.user.role) && Number(d.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }
    await m.remove(d.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, upvote, pin, remove };
