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

const strip = (l) => { const { course_school_id, file_path, ...rest } = l; return rest; };
const pub = (l) => { const { file_path, ...rest } = l; return rest; };

const cleanVideoUrl = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (s.length > 500) return false;
  try { return new URL(s).protocol === 'https:' ? s : false; } catch { return false; }
};
const BAD_LINK = 'The video link must be a full web address starting with https://';

const DAY = 86400000;
const isStudent = (user) => user.role === 'student';
const isDripped = (lesson) => Number(lesson.drip_days) > 0;
const enrolledAt = async (student_id, course_id) => {
  const r = await pool.query(`SELECT enrolled_at FROM enrollments WHERE student_id=$1 AND course_id=$2`, [student_id, course_id]);
  return r.rows[0] ? r.rows[0].enrolled_at : null;
};
const unlockAt = (enrolled, lesson) => new Date(new Date(enrolled).getTime() + Number(lesson.drip_days) * DAY);

const create = async (req, res) => {
  try {
    const { course_id, title, content, video_url, file_url, position } = req.body;
    if (!validId(course_id) || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'course_id and title required' });
    }
    const vu = cleanVideoUrl(video_url);
    if (vu === false) return res.status(400).json({ error: BAD_LINK });
    const course = await courseSchool(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const lesson = await createLesson({
      course_id: Number(course_id),
      title: String(title).trim().slice(0, 255),
      content, video_url: vu, file_url,
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
    const lessons = (await getLessonsByCourse(req.params.course_id)).map(pub);
    if (!isStudent(req.user)) return res.json({ lessons });
    const enrolled = lessons.some(isDripped) ? await enrolledAt(req.user.id, Number(req.params.course_id)) : null;
    const now = new Date();
    const out = lessons.map((l) => {
      if (!isDripped(l)) return l;
      const at = enrolled ? unlockAt(enrolled, l) : null;
      if (at && at <= now) return l;
      const { content, video_url, file_url, file_name, file_type, file_size, ...rest } = l;
      return { ...rest, locked: true, unlocks_at: at };
    });
    res.json({ lessons: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Lesson not found' });
    const lesson = await lessonWithSchool(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const deny = () => res.status(403).json({ error: 'You do not have access to this lesson' });
    const role = req.user.role;
    if (!sameSchool(req.user, lesson.course_school_id)) return deny();
    if (role === 'student') {
      const enrolled = await enrolledAt(req.user.id, lesson.course_id);
      if (!enrolled) return deny();
      if (isDripped(lesson)) {
        const at = unlockAt(enrolled, lesson);
        if (at > new Date()) return res.status(403).json({ error: 'This lesson is not unlocked yet', unlocks_at: at });
      }
    } else if (!['super_admin', 'school_admin', 'teacher'].includes(role)) {
      return deny();
    }
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
    const vu = b.video_url !== undefined ? cleanVideoUrl(b.video_url) : null;
    if (vu === false) return res.status(400).json({ error: BAD_LINK });
    const lesson = await updateLesson(existing.id, {
      title: title.slice(0, 255),
      content: b.content !== undefined ? b.content : existing.content,
      video_url: b.video_url !== undefined ? vu : existing.video_url,
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
    if (existing.file_path) {
      try { require('./lessonfile.controller').removeStored(existing.file_path).catch((e) => console.error('File cleanup failed:', e.message)); } catch (e) { console.error('File cleanup failed:', e.message); }
    }
    await deleteLesson(existing.id);
    res.json({ message: 'Lesson deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove };
