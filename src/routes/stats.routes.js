const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/public', async (req, res) => {
  try {
    const [schools, students, teachers, courses] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM schools WHERE is_active = true"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'student' AND is_active = true AND approval_status = 'approved'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role = 'teacher' AND is_active = true AND approval_status = 'approved'"),
      pool.query("SELECT COUNT(*) FROM courses WHERE is_published = true"),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count, 10),
      students: parseInt(students.rows[0].count, 10),
      teachers: parseInt(teachers.rows[0].count, 10),
      courses: parseInt(courses.rows[0].count, 10),
    });
  } catch (e) {
    console.error('stats error:', e.message);
    res.status(500).json({ error: 'Stats unavailable' });
  }
});

module.exports = router;
