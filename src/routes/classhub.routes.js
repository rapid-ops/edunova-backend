const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, getCourse } = require('../utils/access');
const m = require('../models/classsession.model');

pool.query('ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS class_id INTEGER, ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS duration_minutes INTEGER')
  .catch((e) => console.log('class_sessions columns:', e.message));

const staff = authorize('super_admin', 'school_admin', 'teacher');
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
  if (b.class_id !== undefined) out.class_id = (b.class_id === '' || b.class_id === null) ? null : b.class_id;
  return { out };
};

const checkClass = async (user, classId) => {
  if (classId === undefined || classId === null) return null;
  if (!validId(classId)) return { status: 400, error: 'That class is not valid.' };
  const c = await pool.query('SELECT school_id FROM classes WHERE id=$1', [classId]);
  if (!c.rows[0]) return { status: 404, error: 'Class not found' };
  if (!sameSchool(user, c.rows[0].school_id)) return { status: 403, error: 'Access denied' };
  return null;
};

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
      sessions = (await pool.query(
        `${SESSION_SQL} WHERE s.school_id=$1 AND ${RECENT} AND (s.class_id = ANY($2::int[]) OR s.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ANY($3::int[]))) ORDER BY ${ORDER} LIMIT 100`,
        [u.school_id, classIds, ids])).rows;
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
    } else {
      const sid = u.role === 'super_admin' ? req.query.school_id : u.school_id;
      if (validId(sid)) {
        classes = (await pool.query(`${CLASS_BASE} WHERE c.school_id=$1 ORDER BY c.grade_level, c.name`, [sid])).rows;
        sessions = (await pool.query(`${SESSION_SQL} WHERE s.school_id=$1 AND ${RECENT} ORDER BY ${ORDER} LIMIT 100`, [sid])).rows;
      }
    }
    const staffRole = isAdmin(u) || u.role === 'teacher';
    sessions = sessions.map((s) => ({ ...s, can_manage: staffRole && (isAdmin(u) || Number(s.teacher_id) === Number(u.id)) }));
    res.json({ role: u.role, can_create: staffRole, classes, sessions });
  } catch (e) { oops(res, e); }
});

router.post('/sessions', protect, staff, async (req, res) => {
  try {
    if (!validId(req.body.course_id)) return res.status(400).json({ error: 'Please choose a course.' });
    const course = await getCourse(req.body.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (!req.body.title || !String(req.body.title).trim()) return res.status(400).json({ error: 'Please enter a title.' });
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    const bad = await checkClass(req.user, c.out.class_id);
    if (bad) return res.status(bad.status).json({ error: bad.error });
    const s = await m.create({ school_id: course.school_id, teacher_id: req.user.id, course_id: course.id, title: c.out.title, meeting_url: c.out.meeting_url || null });
    const extra = { class_id: c.out.class_id ?? null, scheduled_at: c.out.scheduled_at ?? null, duration_minutes: c.out.duration_minutes ?? null };
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
    const bad = await checkClass(req.user, c.out.class_id);
    if (bad) return res.status(bad.status).json({ error: bad.error });
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

module.exports = router;
