const pool = require('../config/db');
const { enroll, getEnrollmentsByStudent, getEnrollmentsByCourse, unenroll } = require('../models/enrollment.model');
const { validId, sameSchool, canSeeStudent, getUser } = require('../utils/access');
const T = require('../utils/teaching');
const { notifyUsers, pushLive } = require('../services/notify.service');

const STAFF = ['super_admin', 'school_admin', 'teacher'];
const fail = (res, err) => {
  console.error('enrollment error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Loads the course and checks the caller may manage its students:
// an admin of the school, or a teacher who teaches the course.
const loadManagedCourse = async (req, res, courseId) => {
  if (!validId(courseId)) { res.status(400).json({ error: 'Choose a course first.' }); return null; }
  const course = await T.getCourseFull(courseId);
  if (!course) { res.status(404).json({ error: 'Course not found.' }); return null; }
  if (!sameSchool(req.user, course.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  if (!(await T.canManageCourse(req.user, course))) {
    res.status(403).json({ error: 'You can only manage students in courses you teach.' });
    return null;
  }
  return course;
};

// One in-app notification per newly added student. Never blocks the enrollment.
const announce = async (req, course, ids) => {
  try {
    const rows = await notifyUsers(pool, {
      school_id: course.school_id, user_ids: ids,
      title: `You have been added to ${course.title}`, body: null, type: 'enrollment',
    });
    pushLive(req.app.get('io'), rows);
  } catch (e) { console.error('Enrollment notification failed:', e.message); }
};

const create = async (req, res) => {
  try {
    const { student_id, course_id } = req.body || {};
    if (!validId(student_id) || !validId(course_id)) return res.status(400).json({ error: 'student_id and course_id required' });
    const course = await loadManagedCourse(req, res, course_id);
    if (!course) return;
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(course.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const enrollment = await enroll({ student_id: st.id, course_id: course.id });
    await announce(req, course, [st.id]);
    res.status(201).json({ enrollment });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'This student is already in this course.' });
    fail(res, err);
  }
};

const byStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ enrollments: await getEnrollmentsByStudent(access.student.id) });
  } catch (err) { fail(res, err); }
};

const byCourse = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const course = await T.getCourseFull(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({
      enrollments: await getEnrollmentsByCourse(course.id),
      course: {
        id: course.id, title: course.title, class_id: course.class_id, is_published: course.is_published,
        allow_self_enrollment: course.allow_self_enrollment, can_manage: await T.canManageCourse(req.user, course),
      },
    });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const body = req.body || {};
    const student_id = body.student_id !== undefined ? body.student_id : req.params.student_id;
    const course_id = body.course_id !== undefined ? body.course_id : req.params.course_id;
    if (!validId(student_id) || !validId(course_id)) return res.status(400).json({ error: 'student_id and course_id required' });
    const course = await loadManagedCourse(req, res, course_id);
    if (!course) return;
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(course.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    await unenroll({ student_id: st.id, course_id: course.id });
    res.json({ message: 'Unenrolled successfully' });
  } catch (err) { fail(res, err); }
};

const bulk = async (req, res) => {
  try {
    const { course_id, class_id, student_ids } = req.body || {};
    if (!validId(course_id)) return res.status(400).json({ error: 'Choose a course first.' });
    if (student_ids !== undefined && !Array.isArray(student_ids)) return res.status(400).json({ error: 'Choose at least one student.' });
    const given = student_ids || [];
    if (!class_id && !given.length) return res.status(400).json({ error: 'Choose a class or at least one student.' });
    if (given.length > T.MAX_BULK) return res.status(400).json({ error: `You can add at most ${T.MAX_BULK} students at a time.` });
    const course = await loadManagedCourse(req, res, course_id);
    if (!course) return;
    let fromClass = [];
    if (class_id) {
      const cls = await T.getClassFull(class_id);
      if (!cls || Number(cls.school_id) !== Number(course.school_id)) return res.status(404).json({ error: 'Class not found in this school.' });
      fromClass = (await pool.query(`SELECT student_id FROM student_classes WHERE class_id=$1`, [cls.id])).rows.map((x) => x.student_id);
    }
    const requested = fromClass.length + given.length;
    if (requested > T.MAX_BULK) return res.status(400).json({ error: `You can add at most ${T.MAX_BULK} students at a time.` });
    if (!requested) return res.json({ result: { added: 0, already_enrolled: 0, skipped: 0 }, message: 'That class has no students yet.' });
    const ids = await T.validStudents(T.cleanIds([...fromClass, ...given]), course.school_id);
    let added = [];
    if (ids.length) {
      added = await T.inTxn(async (c) => (await c.query(
        `INSERT INTO enrollments (student_id, course_id)
         SELECT u, $2::int FROM unnest($1::int[]) AS u
         ON CONFLICT (student_id, course_id) DO NOTHING RETURNING student_id`, [ids, course.id])).rows.map((x) => x.student_id));
    }
    await announce(req, course, added);
    const already = ids.length - added.length;
    const skipped = Math.max(0, requested - ids.length);
    const parts = [];
    if (added.length) parts.push(`${plural(added.length, 'student was', 'students were')} added.`);
    if (already) parts.push(`${plural(already, 'student was', 'students were')} already in this course.`);
    if (skipped) parts.push(`${plural(skipped, 'person', 'people')} could not be added.`);
    res.status(added.length ? 201 : 200).json({
      result: { added: added.length, already_enrolled: already, skipped },
      message: parts.length ? parts.join(' ') : 'No students were added.',
    });
  } catch (err) { fail(res, err); }
};

const selfEnroll = async (req, res) => {
  try {
    const { course_id } = req.body || {};
    if (!validId(course_id)) return res.status(400).json({ error: 'Choose a course first.' });
    const course = await T.getCourseFull(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    if (Number(course.school_id) !== Number(req.user.school_id) || !course.is_published || !course.allow_self_enrollment) {
      return res.status(403).json({ error: 'This course is not open for you to join yourself. Please ask your teacher.' });
    }
    const enrollment = await enroll({ student_id: req.user.id, course_id: course.id });
    res.status(201).json({ enrollment });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'You are already in this course.' });
    fail(res, err);
  }
};

const setSelfEnrollment = async (req, res) => {
  try {
    const { allow } = req.body || {};
    if (typeof allow !== 'boolean') return res.status(400).json({ error: 'Choose on or off.' });
    const course = await loadManagedCourse(req, res, req.params.course_id);
    if (!course) return;
    const r = await pool.query(`UPDATE courses SET allow_self_enrollment=$1 WHERE id=$2 RETURNING id, allow_self_enrollment`, [allow, course.id]);
    res.json({ course: r.rows[0] });
  } catch (err) { fail(res, err); }
};

// Students of the school who are not yet in this course (search by name or email)
const candidates = async (req, res) => {
  try {
    const course = await loadManagedCourse(req, res, req.params.course_id);
    if (!course) return;
    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email,
              (SELECT string_agg(c.name, ', ') FROM student_classes sc JOIN classes c ON c.id=sc.class_id WHERE sc.student_id=u.id) AS class_names
       FROM users u
       WHERE u.school_id=$1 AND u.role='student' AND u.is_active IS NOT FALSE AND u.approval_status='approved'
         AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=u.id AND e.course_id=$2)
         AND ($3::text = '' OR u.full_name ILIKE '%'||$3::text||'%' OR u.email ILIKE '%'||$3::text||'%')
       ORDER BY u.full_name LIMIT 50`,
      [course.school_id, course.id, T.likeText(req.query.q)]);
    res.json({ students: r.rows });
  } catch (err) { fail(res, err); }
};

module.exports = { create, byStudent, byCourse, remove, bulk, selfEnroll, setSelfEnrollment, candidates };
