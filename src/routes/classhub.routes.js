const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');
const m = require('../models/classsession.model');

pool.query('ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS class_id INTEGER, ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS duration_minutes INTEGER')
  .catch((e) => console.log('class_sessions columns:', e.message));

const staff = authorize('super_admin', 'school_admin', 'teacher');
const adminOnly = authorize('super_admin', 'school_admin');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);
const isAdmin = (u) => u.role === 'super_admin' || u.role === 'school_admin';
const oops = (res, e) => res.status(500).json({ error: e.message });

const CLASS_BASE = `SELECT c.id, c.name, c.grade_level, c.room, c.capacity, c.teacher_id, t.full_name AS teacher_name,
    (SELECT COUNT(*)::int FROM student_classes x WHERE x.class_id = c.id) AS student_count
  FROM classes c LEFT JOIN users t ON t.id = c.teacher_id`;
const SESSION_SQL = `SELECT s.id, s.title, s.code, s.is_active, s.meeting_url, s.scheduled_at, s.duration_minutes, s.created_at,
    s.class_id, cl.name AS class_name, s.course_id, co.title AS course_title, s.teacher_id, u.full_name AS teacher_name
  FROM class_sessions s
  LEFT JOIN classes cl ON cl.id = s.class_id
  LEFT JOIN courses co ON co.id = s.course_id
  LEFT JOIN users u ON u.id = s.teacher_id`;
const RECENT = `(s.is_active OR s.created_at > NOW() - INTERVAL '60 days')`;
const ORDER = `s.is_active DESC, COALESCE(s.scheduled_at, s.created_at) DESC`;

const cleanUrl = (v) => {
  if (!v) return null;
  try { const u = new URL(String(v).trim()); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 500) : null; } catch { return null; }
};

const clean = (b) => {
  const out = {};
  if (b.title !== undefined) {
    const t = String(b.title || '').trim();
    if (!t) return { error: 'Please enter a title.' };
    out.title = t.slice(0, 255);
  }
  if (b.meeting_url !== undefined) {
    if (b.meeting_url && !cleanUrl(b.meeting_url)) return { error: 'The meeting link must start with http:// or https://' };
    out.meeting_url = cleanUrl(b.meeting_url);
  }
  if (b.scheduled_at !== undefined) {
    if (b.scheduled_at && Number.isNaN(Date.parse(b.scheduled_at))) return { error: 'That date and time is not valid.' };
    out.scheduled_at = b.scheduled_at ? new Date(b.scheduled_at).toISOString() : null;
  }
  if (b.duration_minutes !== undefined) {
    if (b.duration_minutes === '' || b.duration_minutes === null) out.duration_minutes = null;
    else {
      const n = Number(b.duration_minutes);
      if (!Number.isInteger(n) || n < 5 || n > 600) return { error: 'Duration must be between 5 and 600 minutes.' };
      out.duration_minutes = n;
    }
  }
  return { out };
};

const loadCourse = async (id) => {
  if (!validId(id)) return null;
  return (await pool.query('SELECT id, school_id, class_id, teacher_id, title FROM courses WHERE id=$1', [id])).rows[0] || null;
};

// A teacher may schedule a course they teach, or any course of a class they are class teacher of
const canTeach = async (user, course) => {
  if (isAdmin(user)) return true;
  if (course.teacher_id && Number(course.teacher_id) === Number(user.id)) return true;
  const a = await pool.query('SELECT 1 FROM course_assignments WHERE course_id=$1 AND teacher_id=$2 LIMIT 1', [course.id, user.id]);
  if (a.rows[0]) return true;
  if (course.class_id) {
    const c = await pool.query('SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2', [course.class_id, user.id]);
    if (c.rows[0]) return true;
  }
  return false;
};

const COURSE_TEACHER = `COALESCE(tu.full_name, (SELECT string_agg(x.full_name, ', ') FROM course_assignments ca JOIN users x ON x.id = ca.teacher_id WHERE ca.course_id = co.id))`;
const SLOT_SQL = `SELECT t.id, t.class_id, t.course_id, t.teacher_id, t.day_of_week,
    substring(t.start_time::text from 1 for 5) AS start_time, substring(t.end_time::text from 1 for 5) AS end_time,
    cl.name AS class_name, co.title AS course_title, tu.full_name AS teacher_name
  FROM timetable t
  LEFT JOIN classes cl ON cl.id = t.class_id
  LEFT JOIN courses co ON co.id = t.course_id
  LEFT JOIN users tu ON tu.id = t.teacher_id`;
const SLOT_ORDER = `ORDER BY array_position(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']::text[], t.day_of_week::text), t.start_time::text`;

const loadOwn = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Session not found' }); return null; }
  const r = await pool.query('SELECT * FROM class_sessions WHERE id=$1', [req.params.id]);
  const s = r.rows[0];
  if (!s) { res.status(404).json({ error: 'Session not found' }); return null; }
  if (!sameSchool(req.user, s.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  if (!(isAdmin(req.user) || Number(s.teacher_id) === Number(req.user.id))) { res.status(403).json({ error: 'Access denied' }); return null; }
  return s;
};

// The classes and live sessions the logged-in user should see.
router.get('/mine', protect, async (req, res) => {
  try {
    const u = req.user;
    let classes = [];
    let sessions = [];
    let teacherCourses = [];
    let slots = [];
    if (u.role === 'student' || u.role === 'parent') {
      let ids = [Number(u.id)];
      if (u.role === 'parent') {
        const k = await pool.query('SELECT student_id FROM parent_student WHERE parent_id=$1', [u.id]);
        ids = k.rows.map((x) => Number(x.student_id));
      }
      classes = (await pool.query(`${CLASS_BASE} WHERE c.id IN (SELECT class_id FROM student_classes WHERE student_id = ANY($1::int[])) ORDER BY c.grade_level, c.name`, [ids])).rows;
      if (u.role === 'parent' && classes.length) {
        const who = await pool.query('SELECT sc.class_id, us.full_name FROM student_classes sc JOIN users us ON us.id = sc.student_id WHERE sc.student_id = ANY($1::int[])', [ids]);
        classes = classes.map((c) => ({ ...c, children: who.rows.filter((w) => Number(w.class_id) === Number(c.id)).map((w) => w.full_name) }));
      }
      const classIds = classes.map((c) => Number(c.id));
      const cs = classIds.length ? (await pool.query(
        `SELECT co.id, co.title, co.class_id, ${COURSE_TEACHER} AS teacher_name
         FROM courses co LEFT JOIN users tu ON tu.id = co.teacher_id
         WHERE co.class_id = ANY($1::int[]) ORDER BY co.title`, [classIds])).rows : [];
      const tt = classIds.length ? (await pool.query(`${SLOT_SQL} WHERE t.class_id = ANY($1::int[]) ${SLOT_ORDER}`, [classIds])).rows : [];
      const mates = (u.role === 'student' && classIds.length) ? (await pool.query(
        `SELECT sc.class_id, us.full_name FROM student_classes sc JOIN users us ON us.id = sc.student_id
         WHERE sc.class_id = ANY($1::int[]) AND us.id <> $2 ORDER BY us.full_name LIMIT 500`, [classIds, u.id])).rows : [];
      classes = classes.map((c) => ({
        ...c,
        courses: cs.filter((x) => Number(x.class_id) === Number(c.id)),
        timetable: tt.filter((x) => Number(x.class_id) === Number(c.id)),
        classmates: mates.filter((x) => Number(x.class_id) === Number(c.id)).map((x) => x.full_name),
      }));
      sessions = classIds.length ? (await pool.query(
        `${SESSION_SQL} WHERE s.school_id=$1 AND ${RECENT} AND (s.class_id = ANY($2::int[]) OR s.course_id IN (SELECT id FROM courses WHERE class_id = ANY($2::int[]))) ORDER BY ${ORDER} LIMIT 100`,
        [u.school_id, classIds])).rows : [];
    } else if (u.role === 'teacher') {
      classes = (await pool.query(
        `${CLASS_BASE} WHERE c.school_id=$2 AND (c.teacher_id=$1 OR EXISTS (
           SELECT 1 FROM courses co WHERE co.class_id=c.id AND (co.teacher_id=$1
             OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id=co.id AND ca.teacher_id=$1))))
         ORDER BY c.grade_level, c.name`, [u.id, u.school_id])).rows;
      const classIds = classes.map((c) => Number(c.id));
      sessions = (await pool.query(
        `${SESSION_SQL} WHERE s.school_id=$2 AND ${RECENT} AND (s.teacher_id=$1 OR s.class_id = ANY($3::int[])) ORDER BY ${ORDER} LIMIT 100`,
        [u.id, u.school_id, classIds])).rows;
      teacherCourses = (await pool.query(
        `SELECT co.id, co.title, co.class_id, cl.name AS class_name
         FROM courses co LEFT JOIN classes cl ON cl.id = co.class_id
         WHERE co.school_id=$2 AND (co.teacher_id=$1 OR cl.teacher_id=$1
           OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id=co.id AND ca.teacher_id=$1))
         ORDER BY cl.name NULLS LAST, co.title`, [u.id, u.school_id])).rows;
      const cids = teacherCourses.map((c) => Number(c.id));
      slots = (await pool.query(`${SLOT_SQL} WHERE t.school_id=$2 AND (t.teacher_id=$1 OR t.course_id = ANY($3::int[])) ${SLOT_ORDER}`, [u.id, u.school_id, cids])).rows;
    } else {
      const sid = u.role === 'super_admin' ? req.query.school_id : u.school_id;
      if (validId(sid)) {
        classes = (await pool.query(`${CLASS_BASE} WHERE c.school_id=$1 ORDER BY c.grade_level, c.name`, [sid])).rows;
        sessions = (await pool.query(`${SESSION_SQL} WHERE s.school_id=$1 AND ${RECENT} ORDER BY ${ORDER} LIMIT 100`, [sid])).rows;
      }
    }
    const staffRole = isAdmin(u) || u.role === 'teacher';
    sessions = sessions.map((s) => ({ ...s, can_manage: staffRole && (isAdmin(u) || Number(s.teacher_id) === Number(u.id)) }));
    res.json({ me: u.id, role: u.role, can_create: u.role === 'teacher', classes, sessions, courses: teacherCourses, slots });
  } catch (e) { oops(res, e); }
});

router.post('/sessions', protect, staff, async (req, res) => {
  try {
    const course = await loadCourse(req.body.course_id);
    if (!course) return res.status(400).json({ error: 'Please choose a course.' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (!(await canTeach(req.user, course))) return res.status(403).json({ error: 'You can only schedule sessions for your own courses.' });
    if (!req.body.title || !String(req.body.title).trim()) return res.status(400).json({ error: 'Please enter a title.' });
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    const s = await m.create({ school_id: course.school_id, teacher_id: req.user.id, course_id: course.id, title: c.out.title, meeting_url: c.out.meeting_url || null });
    const extra = { class_id: course.class_id || null, scheduled_at: c.out.scheduled_at ?? null, duration_minutes: c.out.duration_minutes ?? null };
    await pool.query('UPDATE class_sessions SET class_id=$2, scheduled_at=$3, duration_minutes=$4 WHERE id=$1', [s.id, extra.class_id, extra.scheduled_at, extra.duration_minutes]);
    res.status(201).json({ session: { ...s, ...extra } });
  } catch (e) { oops(res, e); }
});

router.put('/sessions/:id', protect, staff, async (req, res) => {
  try {
    const s = await loadOwn(req, res);
    if (!s) return;
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    const keys = Object.keys(c.out);
    if (!keys.length) return res.json({ session: s });
    const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
    const r = await pool.query(`UPDATE class_sessions SET ${sets} WHERE id=$1 RETURNING *`, [s.id, ...keys.map((k) => c.out[k])]);
    res.json({ session: r.rows[0] });
  } catch (e) { oops(res, e); }
});

router.delete('/sessions/:id', protect, staff, async (req, res) => {
  try {
    const s = await loadOwn(req, res);
    if (!s) return;
    await pool.query('DELETE FROM session_questions WHERE session_id=$1', [s.id]);
    await pool.query('DELETE FROM class_sessions WHERE id=$1', [s.id]);
    res.json({ message: 'Session deleted' });
  } catch (e) { oops(res, e); }
});

// Weekly lecture slots (the class timetable) - teachers set them for their own courses
router.post('/slots', protect, staff, async (req, res) => {
  try {
    const course = await loadCourse(req.body.course_id);
    if (!course) return res.status(400).json({ error: 'Please choose a course.' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (!(await canTeach(req.user, course))) return res.status(403).json({ error: 'You can only set the time for your own courses.' });
    if (!course.class_id) return res.status(400).json({ error: 'This course is not in a class yet. Ask the school office to add it to a class.' });
    const day = String(req.body.day_of_week || '');
    const start = hhmm(req.body.start_time);
    const end = hhmm(req.body.end_time);
    if (!DAYS.includes(day)) return res.status(400).json({ error: 'Please choose a day.' });
    if (!start || !end) return res.status(400).json({ error: 'Please choose a start and end time.' });
    if (end <= start) return res.status(400).json({ error: 'The end time must be after the start time.' });
    const tid = isAdmin(req.user) ? (course.teacher_id || null) : req.user.id;
    const clash = await pool.query(
      `SELECT 1 FROM timetable WHERE day_of_week=$2 AND (class_id=$1 OR ($5::int IS NOT NULL AND teacher_id=$5))
         AND substring(start_time::text from 1 for 5) < $4 AND substring(end_time::text from 1 for 5) > $3 LIMIT 1`,
      [course.class_id, day, start, end, tid]);
    if (clash.rows[0]) return res.status(400).json({ error: 'That time overlaps another lecture for this class or for you.' });
    const ins = await pool.query(
      'INSERT INTO timetable (school_id, class_id, course_id, teacher_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [course.school_id, course.class_id, course.id, tid, day, start, end]);
    const row = (await pool.query(`${SLOT_SQL} WHERE t.id=$1`, [ins.rows[0].id])).rows[0];
    res.status(201).json({ slot: row });
  } catch (e) { oops(res, e); }
});

router.delete('/slots/:id', protect, staff, async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Slot not found' });
    const r = await pool.query('SELECT id, school_id, course_id, teacher_id FROM timetable WHERE id=$1', [req.params.id]);
    const s = r.rows[0];
    if (!s) return res.status(404).json({ error: 'Slot not found' });
    if (!sameSchool(req.user, s.school_id)) return res.status(403).json({ error: 'Access denied' });
    let ok = isAdmin(req.user) || Number(s.teacher_id) === Number(req.user.id);
    if (!ok) { const course = await loadCourse(s.course_id); ok = !!course && (await canTeach(req.user, course)); }
    if (!ok) return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM timetable WHERE id=$1', [s.id]);
    res.json({ message: 'Slot removed' });
  } catch (e) { oops(res, e); }
});

// School admin: everything about one class in one call
const loadAdminClass = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Class not found' }); return null; }
  const r = await pool.query('SELECT id, school_id FROM classes WHERE id=$1', [req.params.id]);
  const c = r.rows[0];
  if (!c) { res.status(404).json({ error: 'Class not found' }); return null; }
  if (!sameSchool(req.user, c.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return c;
};

router.get('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    const c = await loadAdminClass(req, res);
    if (!c) return;
    const cls = (await pool.query(`${CLASS_BASE} WHERE c.id=$1`, [c.id])).rows[0];
    const students = (await pool.query(
      `SELECT u.id, u.full_name, u.email FROM student_classes sc JOIN users u ON u.id = sc.student_id WHERE sc.class_id=$1 ORDER BY u.full_name`, [c.id])).rows;
    const courses = (await pool.query(
      `SELECT co.id, co.title, co.teacher_id, ${COURSE_TEACHER} AS teacher_name
       FROM courses co LEFT JOIN users tu ON tu.id = co.teacher_id WHERE co.class_id=$1 ORDER BY co.title`, [c.id])).rows;
    const available = (await pool.query(
      `SELECT co.id, co.title, cl.name AS class_name FROM courses co LEFT JOIN classes cl ON cl.id = co.class_id
       WHERE co.school_id=$1 AND (co.class_id IS NULL OR co.class_id <> $2) ORDER BY co.title`, [c.school_id, c.id])).rows;
    const teachers = (await pool.query(
      `SELECT id, full_name FROM users WHERE school_id=$1 AND role='teacher' AND is_active IS NOT FALSE ORDER BY full_name`, [c.school_id])).rows;
    res.json({ class: cls, students, courses, available_courses: available, teachers });
  } catch (e) { oops(res, e); }
});

router.post('/admin/:id/courses', protect, adminOnly, async (req, res) => {
  try {
    const c = await loadAdminClass(req, res);
    if (!c) return;
    const course = await loadCourse(req.body.course_id);
    if (!course || Number(course.school_id) !== Number(c.school_id)) return res.status(404).json({ error: 'Course not found' });
    await pool.query('DELETE FROM timetable WHERE course_id=$1 AND class_id IS DISTINCT FROM $2', [course.id, c.id]);
    await pool.query('UPDATE courses SET class_id=$1 WHERE id=$2', [c.id, course.id]);
    res.json({ message: 'Course added to the class' });
  } catch (e) { oops(res, e); }
});

router.delete('/admin/:id/courses/:course_id', protect, adminOnly, async (req, res) => {
  try {
    const c = await loadAdminClass(req, res);
    if (!c) return;
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    await pool.query('DELETE FROM timetable WHERE course_id=$1 AND class_id=$2', [req.params.course_id, c.id]);
    await pool.query('UPDATE courses SET class_id=NULL WHERE id=$1 AND class_id=$2', [req.params.course_id, c.id]);
    res.json({ message: 'Course removed from the class' });
  } catch (e) { oops(res, e); }
});

router.put('/admin/courses/:course_id/teacher', protect, adminOnly, async (req, res) => {
  try {
    const course = await loadCourse(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    let tid = null;
    if (req.body.teacher_id !== null && req.body.teacher_id !== '' && req.body.teacher_id !== undefined) {
      if (!validId(req.body.teacher_id)) return res.status(400).json({ error: 'Choose a teacher from the list.' });
      const t = await pool.query('SELECT id, role, school_id FROM users WHERE id=$1', [req.body.teacher_id]);
      if (!t.rows[0] || t.rows[0].role !== 'teacher' || Number(t.rows[0].school_id) !== Number(course.school_id)) {
        return res.status(400).json({ error: 'The teacher must be a teacher from this school.' });
      }
      tid = t.rows[0].id;
    }
    await pool.query('UPDATE courses SET teacher_id=$1 WHERE id=$2', [tid, course.id]);
    res.json({ message: 'Teacher updated' });
  } catch (e) { oops(res, e); }
});

module.exports = router;