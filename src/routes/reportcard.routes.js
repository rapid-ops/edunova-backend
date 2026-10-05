const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');

router.get('/:student_id/:school_id', protect, async (req, res) => {
  try {
    const { student_id, school_id } = req.params;
    const { term } = req.query;

    // Student info
    const studentRes = await pool.query(
      `SELECT u.full_name, u.id,
              c.name as class_name,
              s.name as school_name, s.address as school_address
       FROM users u
       LEFT JOIN class_enrollments ce ON ce.student_id = u.id
       LEFT JOIN classes c ON c.id = ce.class_id
       JOIN schools s ON s.id = $2
       WHERE u.id = $1 LIMIT 1`,
      [student_id, school_id]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Results — from gradebook joined to assessments/courses (used as subjects)
    const resultsRes = await pool.query(
      `SELECT
         co.title as subject_name,
         ROUND(AVG(g.score) FILTER (WHERE a.type = 'assignment'), 1) as ca_score,
         ROUND(AVG(g.score) FILTER (WHERE a.type = 'exam'), 1) as exam_score,
         ROUND(AVG(g.score), 1) as total_score
       FROM gradebook g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN courses co ON co.id = a.course_id
       WHERE g.student_id = $1 AND g.school_id = $2
       GROUP BY co.id, co.title
       ORDER BY co.title`,
      [student_id, school_id]
    );

    // Attendance
    const attRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present') as present,
         COUNT(*) FILTER (WHERE status = 'absent') as absent,
         COUNT(*) as total
       FROM attendance
       WHERE student_id = $1 AND school_id = $2`,
      [student_id, school_id]
    );
    const att = attRes.rows[0];
    const present = Number(att.present);
    const total = Number(att.total);
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

    // Position in class
    const posRes = await pool.query(
      `SELECT student_id, RANK() OVER (ORDER BY AVG(score) DESC) as position
       FROM gradebook
       WHERE school_id = $1
       GROUP BY student_id`,
      [school_id]
    );
    const myPos = posRes.rows.find(r => String(r.student_id) === String(student_id));

    // Class teacher
    const teacherRes = await pool.query(
      `SELECT u.full_name FROM users u
       JOIN classes c ON c.teacher_id = u.id
       JOIN class_enrollments ce ON ce.class_id = c.id
       WHERE ce.student_id = $1 LIMIT 1`,
      [student_id]
    );

    res.json({
      student_name: student.full_name,
      class_name: student.class_name,
      school_name: student.school_name,
      school_address: student.school_address,
      academic_year: '2025/2026',
      term: term || 'First Term',
      results: resultsRes.rows,
      attendance: {
        present,
        absent: Number(att.absent),
        total,
        percentage,
      },
      position: myPos ? `${myPos.position}${ordinal(Number(myPos.position))}` : '-',
      teacher_name: teacherRes.rows[0]?.full_name || null,
      teacher_comment: 'Keep up the good work!',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

module.exports = router;
