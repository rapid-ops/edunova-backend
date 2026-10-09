const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, getUser, getClass, getCourse } = require('../utils/access');

const ORDER = `ORDER BY CASE t.day_of_week
  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
  WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
  WHEN 'Friday' THEN 5 END, t.start_time`;

// Create timetable entry
router.post('/', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { class_id, course_id, teacher_id, day_of_week, start_time, end_time } = req.body;
  try {
    if (!validId(class_id) || !validId(course_id) || !day_of_week || String(day_of_week).length > 20 || !start_time || !end_time) {
      return res.status(400).json({ error: 'class_id, course_id, day_of_week, start_time and end_time required' });
    }
    const cls = await getClass(class_id);
    const course = await getCourse(course_id);
    if (!cls || !course) return res.status(404).json({ error: 'Class or course not found' });
    if (!sameSchool(req.user, cls.school_id) || Number(course.school_id) !== Number(cls.school_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    let teacher = null;
    if (teacher_id !== undefined && teacher_id !== null && teacher_id !== '') {
      teacher = await getUser(teacher_id);
      if (!teacher || Number(teacher.school_id) !== Number(cls.school_id)) {
        return res.status(404).json({ error: 'Teacher not found in this school' });
      }
    }
    const result = await pool.query(
      `INSERT INTO timetable (school_id, class_id, course_id, teacher_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [cls.school_id, cls.id, course.id, teacher ? teacher.id : null, day_of_week, start_time, end_time]
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timetable by class
router.get('/class/:class_id', protect, async (req, res) => {
  try {
    const cls = await getClass(req.params.class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, u.full_name as teacher_name
       FROM timetable t
       JOIN courses c ON t.course_id = c.id
       LEFT JOIN users u ON t.teacher_id = u.id
       WHERE t.class_id=$1
       ${ORDER}`,
      [cls.id]
    );
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timetable by teacher
router.get('/teacher/:teacher_id', protect, async (req, res) => {
  try {
    const target = await getUser(req.params.teacher_id);
    if (!target) return res.status(404).json({ error: 'Teacher not found' });
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, cl.name as class_name
       FROM timetable t
       JOIN courses c ON t.course_id = c.id
       JOIN classes cl ON t.class_id = cl.id
       WHERE t.teacher_id=$1
       ${ORDER}`,
      [target.id]
    );
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get whole school timetable
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, cl.name as class_name, u.full_name as teacher_name
       FROM timetable t
       JOIN courses c ON t.course_id = c.id
       JOIN classes cl ON t.class_id = cl.id
       LEFT JOIN users u ON t.teacher_id = u.id
       WHERE t.school_id=$1
       ${ORDER}`,
      [req.params.school_id]
    );
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete entry
router.delete('/:id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Entry not found' });
    const e = await pool.query(`SELECT school_id FROM timetable WHERE id=$1`, [req.params.id]);
    if (!e.rows[0]) return res.status(404).json({ error: 'Entry not found' });
    if (!sameSchool(req.user, e.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(`DELETE FROM timetable WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Get timetable for a student (via their class enrollment)
router.get('/student/:student_id', protect, async (req, res) => {
  try {
    const { student_id } = req.params;
    if (!validId(student_id)) return res.status(404).json({ error: 'Student not found' });
    const st = await getUser(student_id);
    if (!st) return res.status(404).json({ error: 'Student not found' });
    if (!sameSchool(req.user, st.school_id)) return res.status(403).json({ error: 'Access denied' });
    const ceRes = await pool.query(
      `SELECT class_id FROM class_enrollments WHERE student_id=$1 LIMIT 1`, [student_id]);
    if (!ceRes.rows[0]) return res.json({ timetable: [] });
    const class_id = ceRes.rows[0].class_id;
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, u.full_name as teacher_name
       FROM timetable t JOIN courses c ON t.course_id=c.id
       LEFT JOIN users u ON t.teacher_id=u.id
       WHERE t.class_id=$1 ${ORDER}`, [class_id]);
    res.json({ timetable: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
