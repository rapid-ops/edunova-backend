const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

// Create timetable entry
router.post('/', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { school_id, class_id, course_id, teacher_id, day_of_week, start_time, end_time } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO timetable (school_id, class_id, course_id, teacher_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [school_id, class_id, course_id, teacher_id, day_of_week, start_time, end_time]
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timetable by class
router.get('/class/:class_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, u.full_name as teacher_name
       FROM timetable t
       JOIN courses c ON t.course_id = c.id
       LEFT JOIN users u ON t.teacher_id = u.id
       WHERE t.class_id=$1
       ORDER BY CASE t.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
         WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
         WHEN 'Friday' THEN 5 END, t.start_time`,
      [req.params.class_id]
    );
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get timetable by teacher
router.get('/teacher/:teacher_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, c.title as course_title, cl.name as class_name
       FROM timetable t
       JOIN courses c ON t.course_id = c.id
       JOIN classes cl ON t.class_id = cl.id
       WHERE t.teacher_id=$1
       ORDER BY CASE t.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
         WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
         WHEN 'Friday' THEN 5 END, t.start_time`,
      [req.params.teacher_id]
    );
    res.json({ timetable: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete entry
router.delete('/:id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM timetable WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
