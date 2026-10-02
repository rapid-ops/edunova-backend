const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

const validId = (v) => /^\d+$/.test(String(v));

// Checks the parent and student exist, have the right roles, and belong to the caller's school.
const checkPair = async (user, parent_id, student_id) => {
  if (!validId(parent_id) || !validId(student_id)) return { code: 400, error: 'parent_id and student_id required' };
  const r = await pool.query(`SELECT id, role, school_id FROM users WHERE id IN ($1,$2)`, [parent_id, student_id]);
  const p = r.rows.find((x) => String(x.id) === String(parent_id));
  const s = r.rows.find((x) => String(x.id) === String(student_id));
  if (!p || !s) return { code: 404, error: 'User not found' };
  if (p.role !== 'parent' || s.role !== 'student') return { code: 400, error: 'Pick a parent and a student' };
  if (user.role !== 'super_admin') {
    if (user.school_id == null || Number(p.school_id) !== Number(user.school_id) || Number(s.school_id) !== Number(user.school_id)) {
      return { code: 403, error: 'Access denied' };
    }
  }
  return null;
};

// Link parent to student
router.post('/link', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { parent_id, student_id } = req.body;
  try {
    const bad = await checkPair(req.user, parent_id, student_id);
    if (bad) return res.status(bad.code).json({ error: bad.error });
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
    const pid = req.params.parent_id;
    if (!validId(pid)) return res.status(404).json({ error: 'Not found' });
    const u = req.user;
    if (u.role === 'parent') {
      if (Number(u.id) !== Number(pid)) return res.status(403).json({ error: 'Access denied' });
    } else if (u.role === 'school_admin' || u.role === 'teacher') {
      const p = await pool.query(`SELECT school_id FROM users WHERE id=$1`, [pid]);
      if (!p.rows[0] || u.school_id == null || Number(p.rows[0].school_id) !== Number(u.school_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (u.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url
       FROM parent_student ps
       JOIN users u ON ps.student_id = u.id
       WHERE ps.parent_id=$1`,
      [pid]
    );
    res.json({ children: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get child full data (results, attendance, fees)
router.get('/child/:student_id', protect, async (req, res) => {
  const { student_id } = req.params;
  if (!validId(student_id)) return res.status(404).json({ error: 'Not found' });
  try {
    const u = req.user;
    if (u.role === 'parent') {
      const link = await pool.query(
        `SELECT 1 FROM parent_student WHERE parent_id=$1 AND student_id=$2`,
        [u.id, student_id]
      );
      if (!link.rowCount) return res.status(403).json({ error: 'Not your child' });
    } else if (u.role === 'student') {
      if (Number(u.id) !== Number(student_id)) return res.status(403).json({ error: 'Access denied' });
    } else if (u.role !== 'super_admin') {
      const s = await pool.query(`SELECT school_id FROM users WHERE id=$1`, [student_id]);
      if (!s.rows[0] || u.school_id == null || Number(s.rows[0].school_id) !== Number(u.school_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

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
    const bad = await checkPair(req.user, parent_id, student_id);
    if (bad) return res.status(bad.code).json({ error: bad.error });
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
