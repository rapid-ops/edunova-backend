const pool = require('../config/db');
const { createLesson, getLessonsByCourse, updateLesson, deleteLesson } = require('../models/lesson.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const courseSchool = async (course_id) => {
  const r = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [course_id]);
  return r.rows[0] || null;
};

const lessonWithSchool = async (id) => {
  const r = await pool.query(
    `SELECT l.*, c.school_id AS course_school_id
     FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

const strip = (l) => { const { course_school_id, ...rest } = l; return rest; };

const create = async (req, res) => {
  try {
    const { course_id, title, content, video_url, file_url, position } = req.body;
    if (!validId(course_id) || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'course_id and title required' });
    }
    const course = await courseSchool(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const lesson = await createLesson({
      course_id: Number(course_id),
      title: String(title).trim().slice(0, 255),
      content, video_url, file_url,
      position: Number(position) || 0,
    });
    res.status(201).json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await courseSchool(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const lessons = await getLessonsByCourse(req.params.course_id);
    res.json({ lessons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Lesson not found' });
    const lesson = await lessonWithSchool(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!sameSchool(req.user, lesson.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ lesson: strip(lesson) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Lesson not found' });
    const existing = await lessonWithSchool(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lesson not found' });
    if (!sameSchool(req.user, existing.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    const b = req.body;
    const title = b.title !== undefined ? String(b.title).trim() : existing.title;
    if (!title) return res.status(400).json({ error: 'title cannot be empty' });
    const lesson = await updateLesson(existing.id, {
      title: title.slice(0, 255),
      content: b.content !== undefined ? b.content : existing.content,
      video_url: b.video_url !== undefined ? b.video_url : existing.video_url,
      file_url: b.file_url !== undefined ? b.file_url : existing.file_url,
      position: b.position !== undefined ? (Number(b.position) || 0) : existing.position,
    });
    res.json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Lesson not found' });
    const existing = await lessonWithSchool(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Lesson not found' });
    if (!sameSchool(req.user, existing.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    await deleteLesson(existing.id);
    res.json({ message: 'Lesson deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove };
