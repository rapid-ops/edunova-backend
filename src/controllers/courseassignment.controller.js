const pool = require('../config/db');
const m = require('../models/courseassignment.model');
const { validId, sameSchool, getUser } = require('../utils/access');
const T = require('../utils/teaching');

const fail = (res, err) => {
  console.error('course-assignment error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const deny = (res) => res.status(403).json({ error: 'Access denied' });

const assign = async (req, res) => {
  try {
    const { course_id, teacher_id } = req.body || {};
    if (!validId(course_id) || !validId(teacher_id)) return res.status(400).json({ error: 'Choose a course and a teacher.' });
    const course = await T.getCourseFull(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    if (!sameSchool(req.user, course.school_id)) return deny(res);
    const teacher = await getUser(teacher_id);
    if (!teacher || teacher.role !== 'teacher' || Number(teacher.school_id) !== Number(course.school_id)) {
      return res.status(400).json({ error: 'Only teachers from this school can be assigned to a course.' });
    }
    const assignment = await T.inTxn(async (c) => {
      const a = await c.query(
        `INSERT INTO course_assignments (school_id, course_id, teacher_id, assigned_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (course_id, teacher_id) DO UPDATE SET assigned_by=$4, assigned_at=NOW() RETURNING *`,
        [course.school_id, course.id, teacher.id, req.user.id]);
      // The course has no teacher yet (or its owner is not a teacher): make this teacher its main teacher
      await c.query(
        `UPDATE courses SET teacher_id=$1 WHERE id=$2
           AND (teacher_id IS NULL OR NOT EXISTS (SELECT 1 FROM users o WHERE o.id=courses.teacher_id AND o.role='teacher'))`,
        [teacher.id, course.id]);
      return a.rows[0];
    });
    res.status(201).json({ assignment });
  } catch (err) { fail(res, err); }
};

const unassign = async (req, res) => {
  try {
    if (!validId(req.params.course_id) || !validId(req.params.teacher_id)) return res.status(404).json({ error: 'Not found' });
    const course = await T.getCourseFull(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    if (!sameSchool(req.user, course.school_id)) return deny(res);
    await T.inTxn(async (c) => {
      await c.query(`DELETE FROM course_assignments WHERE course_id=$1 AND teacher_id=$2`, [course.id, req.params.teacher_id]);
      // If they owned the course, pass it to another assigned teacher (or leave it without one)
      await c.query(
        `UPDATE courses SET teacher_id=(SELECT ca.teacher_id FROM course_assignments ca WHERE ca.course_id=$1 ORDER BY ca.assigned_at LIMIT 1)
         WHERE id=$1 AND teacher_id=$2`, [course.id, req.params.teacher_id]);
    });
    res.json({ message: 'Unassigned' });
  } catch (err) { fail(res, err); }
};

const byTeacher = async (req, res) => {
  try {
    const t = await getUser(req.params.teacher_id);
    if (!t) return res.status(404).json({ error: 'Teacher not found' });
    const self = Number(req.user.id) === Number(t.id);
    if (!self && !(T.isAdmin(req.user) && sameSchool(req.user, t.school_id))) return deny(res);
    res.json({ courses: await m.getByTeacher(t.id) });
  } catch (err) { fail(res, err); }
};

const bySchool = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!(T.isAdmin(req.user) && sameSchool(req.user, req.params.school_id))) return deny(res);
    res.json({ assignments: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const byCourse = async (req, res) => {
  try {
    const course = await T.getCourseFull(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const ok = (T.isAdmin(req.user) && sameSchool(req.user, course.school_id))
      || (req.user.role === 'teacher' && sameSchool(req.user, course.school_id) && await T.teachesCourse(req.user.id, course.id));
    if (!ok) return deny(res);
    res.json({ teachers: await m.getByCourse(course.id) });
  } catch (err) { fail(res, err); }
};

// One call for the "Who teaches what" page: every course with its teachers, plus the school's teachers
const overview = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!(T.isAdmin(req.user) && sameSchool(req.user, req.params.school_id))) return deny(res);
    const courses = await pool.query(
      `SELECT c.id, c.title, c.is_published, c.teacher_id, cl.name AS class_name,
              COALESCE((SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email) ORDER BY u.full_name)
                        FROM users u WHERE u.role='teacher' AND (u.id=c.teacher_id
                          OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id=c.id AND ca.teacher_id=u.id))), '[]'::json) AS teachers
       FROM courses c LEFT JOIN classes cl ON cl.id=c.class_id WHERE c.school_id=$1 ORDER BY c.title`, [req.params.school_id]);
    const teachers = await pool.query(
      `SELECT id, full_name, email FROM users WHERE school_id=$1 AND role='teacher' AND is_active IS NOT FALSE ORDER BY full_name`,
      [req.params.school_id]);
    res.json({ courses: courses.rows, teachers: teachers.rows });
  } catch (err) { fail(res, err); }
};

module.exports = { assign, unassign, byTeacher, bySchool, byCourse, overview };
