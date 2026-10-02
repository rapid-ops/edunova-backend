const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, canSeeStudent } = require('../utils/access');

const staff = authorize('super_admin', 'school_admin', 'teacher');

const assessmentWithSchool = async (id) => {
  const r = await pool.query(
    `SELECT a.id, a.total_marks, c.school_id AS course_school_id
     FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

// Submit/update a result
router.post('/', protect, staff, async (req, res) => {
  try {
    const { student_id, assessment_id, score, feedback } = req.body;
    if (!validId(student_id) || !validId(assessment_id)) {
      return res.status(400).json({ error: 'student_id and assessment_id required' });
    }
    const a = await assessmentWithSchool(assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    const st = await pool.query(`SELECT id, role, school_id FROM users WHERE id=$1`, [student_id]);
    const student = st.rows[0];
    if (!student || student.role !== 'student' || Number(student.school_id) !== Number(a.course_school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const sc = Number(score);
    if (score === undefined || score === null || score === '' || !Number.isFinite(sc) || sc < 0 || sc > Math.min(Number(a.total_marks), 999.99)) {
      return res.status(400).json({ error: `Score must be between 0 and ${a.total_marks}` });
    }
    const result = await pool.query(
      `INSERT INTO results (school_id, student_id, assessment_id, score, feedback, graded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, assessment_id)
       DO UPDATE SET score=$4, feedback=$5, graded_by=$6
       RETURNING *`,
      [a.course_school_id, student.id, a.id, sc, feedback ? String(feedback).slice(0, 2000) : null, req.user.id]
    );
    res.status(201).json({ result: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get results by student
router.get('/student/:student_id', protect, async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    const result = await pool.query(
      `SELECT r.*, a.title as assessment_title, a.total_marks, a.type
       FROM results r
       JOIN assessments a ON r.assessment_id = a.id
       WHERE r.student_id=$1
       ORDER BY r.created_at DESC`,
      [access.student.id]
    );
    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get results by assessment (staff of the same school)
router.get('/assessment/:assessment_id', protect, staff, async (req, res) => {
  try {
    if (!validId(req.params.assessment_id)) return res.status(404).json({ error: 'Assessment not found' });
    const a = await assessmentWithSchool(req.params.assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `SELECT r.*, u.full_name as student_name
       FROM results r
       JOIN users u ON r.student_id = u.id
       WHERE r.assessment_id=$1
       ORDER BY r.score DESC`,
      [a.id]
    );
    res.json({ results: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
