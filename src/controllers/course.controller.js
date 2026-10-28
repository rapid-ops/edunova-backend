const pool = require('../config/db');
const T = require('../utils/teaching');
const { createCourse, getCoursesBySchool, getCourseById, updateCourse, deleteCourse } = require('../models/course.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const schoolOf = async (id) => {
  const r = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [id]);
  return r.rows[0] || null;
};

const create = async (req, res) => {
  try {
    const { class_id, title, description } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    let school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    } else {
      if (req.user.school_id == null) return res.status(403).json({ error: 'Access denied' });
      school_id = req.user.school_id;
    }
    let classId = null;
    if (validId(class_id)) {
      const cr = await pool.query('SELECT id, school_id FROM classes WHERE id=$1', [class_id]);
      if (!cr.rows[0] || Number(cr.rows[0].school_id) !== Number(school_id)) return res.status(400).json({ error: 'Choose a class from this school.' });
      classId = Number(class_id);
    }
    const course = await createCourse({
      school_id,
      class_id: classId,
      teacher_id: req.user.role === 'teacher' ? req.user.id : null,
      title: String(title).trim().slice(0, 255),
      description: description ? String(description).slice(0, 5000) : null,
    });
    res.status(201).json({ course });
res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const courses = await getCoursesBySchool(req.params.school_id);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const course = await getCourseById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const c = await schoolOf(req.params.id);
    if (!c) return res.status(404).json({ error: 'Course not found' });
    if (!(await T.canManageCourse(req.user, { id: Number(req.params.id), school_id: c.school_id }))) return res.status(403).json({ error: 'Access denied' });
    const { title, description, is_published } = req.body;
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'title cannot be empty' });
    if (is_published !== undefined && typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published must be true or false' });
    }
    const course = await updateCourse(req.params.id, {
      title: title === undefined ? undefined : String(title).trim().slice(0, 255),
      description: description === undefined ? undefined : String(description).slice(0, 5000),
      is_published,
    });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const c = await schoolOf(req.params.id);
    if (!c) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, c.school_id)) return res.status(403).json({ error: 'Access denied' });
    await deleteCourse(req.params.id);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

let lessonCountSql = null;
const getLessonCountSql = async () => {
  if (lessonCountSql) return lessonCountSql;
  const r = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lessons' AND column_name='course_id'");
  lessonCountSql = r.rowCount ? '(SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id)::int' : '0';
  return lessonCountSql;
};

const mine = async (req, res) => {
  try {
    if (req.user.role !== 'teacher' && !T.isAdmin(req.user)) return res.status(403).json({ error: 'Access denied' });
    if (req.user.school_id == null) return res.json({ courses: [] });
    const params = [req.user.school_id];
    let where = 'c.school_id = $1';
    if (req.user.role === 'teacher') {
      params.push(req.user.id);
      where += ' AND (c.teacher_id = $2 OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id = c.id AND ca.teacher_id = $2))';
    }
    const lc = await getLessonCountSql();
    const r = await pool.query(
      `SELECT c.*, cl.name AS class_name, u.full_name AS teacher_name,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)::int AS student_count,
              ${lc} AS lesson_count,
              (SELECT COUNT(*) FROM assessments a WHERE a.course_id = c.id)::int AS assessment_count
       FROM courses c
       LEFT JOIN classes cl ON cl.id = c.class_id
       LEFT JOIN users u ON u.id = c.teacher_id
       WHERE ${where} ORDER BY c.created_at DESC`, params);
    res.json({ courses: r.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove, mine };

