const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/public', async (req, res) => {
  try {
    const [schools, students, teachers, courses] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM schools"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='student'"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='teacher'"),
      pool.query("SELECT COUNT(*) FROM courses WHERE status='published'"),
    ]);
    res.json({
      schools: parseInt(schools.rows[0].count),
      students: parseInt(students.rows[0].count),
      teachers: parseInt(teachers.rows[0].count),
      courses: parseInt(courses.rows[0].count),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
