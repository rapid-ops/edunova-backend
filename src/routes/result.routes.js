const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

// Submit/update a result
router.post('/', protect, authorize('super_admin','school_admin','teacher'), async (req, res) => {
  const { school_id, student_id, assessment_id, score, feedback } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO results (school_id, student_id, assessment_id, score, feedback, graded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, assessment_id)
       DO UPDATE SET score=$4, feedback=$5, graded_by=$6
       RETURNING *`,
      [school_id, student_id, assessment_id, score, feedback, req.user.id]
    );
    res.status(201).json({ result: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get results by student
router.get('/student/:student_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.title as assessment_title, a.total_marks, a.type
       FROM results r
       JOIN assessments a ON r.assessment_id = a.id
       WHERE r.student_id=$1
       ORDER BY r.created_at DESC`,
      [req.params.student_id]
    );
    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get results by assessment
router.get('/assessment/:assessment_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name as student_name
       FROM results r
       JOIN users u ON r.student_id = u.id
       WHERE r.assessment_id=$1
       ORDER BY r.score DESC`,
      [req.params.assessment_id]
    );
    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
