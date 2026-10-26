const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, getClass, getUser } = require('../utils/access');
const T = require('../utils/teaching');

const admin = authorize('super_admin', 'school_admin');
const staff = authorize('super_admin', 'school_admin', 'teacher');
const oops = (res, err) => {
  console.error('class error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};

const CLASS_SQL = `SELECT c.*, u.full_name AS teacher_name,
  (SELECT COUNT(*)::int FROM student_classes sc WHERE sc.class_id=c.id) AS student_count,
  (SELECT COUNT(*)::int FROM courses co WHERE co.class_id=c.id) AS course_count
  FROM classes c LEFT JOIN users u ON u.id=c.teacher_id`;
const loadRow = async (id) => (await pool.query(`${CLASS_SQL} WHERE c.id=$1`, [id])).rows[0];

// Teacher, room and capacity (only the ones sent are returned)
const parseExtras = async (body, school_id, memberCount) => {
  const b = body || {};
  const fields = {};
  if ('teacher_id' in b) {
    if (b.teacher_id === null || b.teacher_id === '') fields.teacher_id = null;
    else {
      if (!validId(b.teacher_id)) return { error: 'Choose a teacher from the list.' };
      const t = await getUser(b.teacher_id);
      if (!t || t.role !== 'teacher' || Number(t.school_id) !== Number(school_id)) {
        return { error: 'The class teacher must be a teacher from this school.' };
      }
      fields.teacher_id = t.id;
    }
  }
  if ('room' in b) {
    const r = String(b.room === null || b.room === undefined ? '' : b.room).trim();
    fields.room = r ? r.slice(0, 100) : null;
  }
  if ('capacity' in b) {
    if (b.capacity === null || b.capacity === '') fields.capacity = null;
    else {
      const n = Number(b.capacity);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return { error: 'Capacity must be a whole number between 1 and 1000.' };
      if (memberCount !== null && memberCount !== undefined && n < memberCount) {
        return { error: `This class already has ${memberCount} students, so the capacity cannot be lower than that.` };
      }
      fields.capacity = n;
    }
  }
  return { fields };
};

router.post('/', protect, admin, async (req, res) => {
  const { name, grade_level } = req.body || {};
  try {
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please enter a class name.' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const ex = await parseExtras(req.body, school_id, null);
    if (ex.error) return res.status(400).json({ error: ex.error });
    const cols = ['school_id', 'name', 'grade_level', ...Object.keys(ex.fields)];
    const vals = [school_id, String(name).trim().slice(0, 100), grade_level === undefined ? null : grade_level, ...Object.values(ex.fields)];
    const ins = await pool.query(
      `INSERT INTO classes (${cols.join(', ')}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`, vals);
    res.status(201).json({ class: await loadRow(ins.rows[0].id) });
  } catch (err) { oops(res, err); }
});

// Classes the logged-in teacher looks after (class teacher, or teaches a linked course)
router.get('/mine', protect, authorize('teacher'), async (req, res) => {
  try {
    const r = await pool.query(
      `${CLASS_SQL} WHERE c.school_id=$2 AND (c.teacher_id=$1 OR EXISTS (
         SELECT 1 FROM courses co WHERE co.class_id=c.id AND (co.teacher_id=$1
           OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id=co.id AND ca.teacher_id=$1))))
       ORDER BY c.grade_level, c.name`, [req.user.id, req.user.school_id]);
    res.json({ classes: r.rows.map((c) => ({ ...c, is_class_teacher: Number(c.teacher_id) === Number(req.user.id) })) });
  } catch (err) { oops(res, err); }
});

router.get('/school/:school_id', protect, async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(`${CLASS_SQL} WHERE c.school_id=$1 ORDER BY c.grade_level, c.name`, [req.params.school_id]);
    res.json({ classes: result.rows });
  } catch (err) { oops(res, err); }
});

router.get('/:id', protect, staff, async (req, res) => {
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const students = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.phone, sc.enrolled_at FROM student_classes sc
       JOIN users u ON u.id=sc.student_id WHERE sc.class_id=$1 ORDER BY u.full_name`, [cls.id]);
    const courses = await pool.query(
      `SELECT c.id, c.title, c.is_published, c.teacher_id, t.full_name AS teacher_name,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id=c.id) AS enrolled_count
       FROM courses c LEFT JOIN users t ON t.id=c.teacher_id WHERE c.class_id=$1 ORDER BY c.title`, [cls.id]);
    res.json({ class: await loadRow(cls.id), students: students.rows, courses: courses.rows, can_manage: await T.canManageClass(req.user, cls) });
  } catch (err) { oops(res, err); }
});

// Students in a class (used by bulk attendance)
router.get('/:id/students', protect, staff, async (req, res) => {
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM student_classes ce
       JOIN users u ON u.id=ce.student_id WHERE ce.class_id=$1 ORDER BY u.full_name`, [cls.id]);
    res.json({ students: result.rows });
  } catch (err) { oops(res, err); }
});

router.put('/:id', protect, admin, async (req, res) => {
  const { name, grade_level } = req.body || {};
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'Class name cannot be empty.' });
    const members = (await pool.query(`SELECT COUNT(*)::int AS n FROM student_classes WHERE class_id=$1`, [cls.id])).rows[0].n;
    const ex = await parseExtras(req.body, cls.school_id, members);
    if (ex.error) return res.status(400).json({ error: ex.error });
    const sets = [];
    const vals = [];
    const add = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (name !== undefined) add('name', String(name).trim().slice(0, 100));
    if (grade_level !== undefined) add('grade_level', grade_level);
    Object.entries(ex.fields).forEach(([k, v]) => add(k, v));
    if (sets.length) {
      vals.push(cls.id);
      await pool.query(`UPDATE classes SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    }
    res.json({ class: await loadRow(cls.id) });
  } catch (err) { oops(res, err); }
});

router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM student_classes WHERE class_id=$1`, [cls.id])).rows[0].n;
    await T.inTxn(async (c) => {
      await c.query(`UPDATE courses SET class_id=NULL WHERE class_id=$1`, [cls.id]);
      await c.query(`DELETE FROM classes WHERE id=$1`, [cls.id]);
    });
    res.json({ message: 'Class deleted', students_removed: n });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'This class is still linked to other records (such as announcements or the timetable), so it cannot be deleted yet.' });
    }
    oops(res, err);
  }
});

module.exports = router;
