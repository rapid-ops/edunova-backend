const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

// Link parent to student
router.post('/link', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { parent_id, student_id } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO parent_student (parent_id, student_id)
       VALUES ($1, $2) RETURNING *`,
      [parent_id, student_id]
    );
    res.status(201).json({ link: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Already linked' });
    res.status(500).json({ error: err.message });
  }
});

// Get children of a parent
router.get('/children/:parent_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url
       FROM parent_student ps
       JOIN users u ON ps.student_id = u.id
       WHERE ps.parent_id=$1`,
      [req.params.parent_id]
    );
    res.json({ children: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get child full data (results, attendance, fees)
router.get('/child/:student_id', protect, async (req, res) => {
  const { student_id } = req.params;
  try {
    const [resultsRes, attendanceRes, feesRes, enrollRes] = await Promise.all([
      pool.query(
        `SELECT r.*, a.title as assessment_title, a.total_marks, a.type
         FROM results r
         JOIN assessments a ON r.assessment_id=a.id
         WHERE r.student_id=$1`,
        [student_id]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status='present') as present,
                COUNT(*) FILTER (WHERE status='absent') as absent,
                COUNT(*) FILTER (WHERE status='late') as late
         FROM attendance WHERE student_id=$1`,
        [student_id]
      ),
      pool.query(`SELECT * FROM fees WHERE student_id=$1`, [student_id]),
      pool.query(
        `SELECT e.*, c.title as course_title FROM enrollments e
         JOIN courses c ON e.course_id=c.id
         WHERE e.student_id=$1`,
        [student_id]
      ),
    ]);

    res.json({
      results: resultsRes.rows,
      attendance: attendanceRes.rows[0],
      fees: feesRes.rows,
      enrollments: enrollRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlink
router.delete('/unlink', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { parent_id, student_id } = req.body;
  try {
    await pool.query(
      `DELETE FROM parent_student WHERE parent_id=$1 AND student_id=$2`,
      [parent_id, student_id]
    );
    res.json({ message: 'Unlinked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
