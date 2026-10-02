const router = require('express').Router();
const { upload, cloudinary } = require('../middleware/upload.middleware');
const { protect, authorize } = require('../middleware/auth.middleware');
const pool = require('../config/db');

// Upload profile picture
router.post('/avatar', protect, upload.single('file'), async (req, res) => {
  try {
    const url = req.file.path;
    await pool.query(
      `UPDATE users SET avatar_url=$1 WHERE id=$2`,
      [url, req.user.id]
    );
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload school logo (only that school's admin)
const ownSchoolOnly = (req, res, next) => {
  if (!/^\d+$/.test(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
  if (req.user.role !== 'super_admin' && Number(req.user.school_id) !== Number(req.params.school_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};
router.post('/logo/:school_id', protect, authorize('school_admin', 'super_admin'), ownSchoolOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = req.file.path;
    await pool.query(
      `UPDATE schools SET logo_url=$1 WHERE id=$2`,
      [url, req.params.school_id]
    );
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload assignment submission (student id comes from the token, never the body)
router.post('/submission', protect, authorize('student'), upload.single('file'), async (req, res) => {
  try {
    const { assessment_id } = req.body;
    if (!assessment_id || !/^\d+$/.test(String(assessment_id))) {
      return res.status(400).json({ error: 'assessment_id required' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ok = await pool.query(
      `SELECT 1 FROM assessments a
       JOIN enrollments e ON e.course_id=a.course_id
       WHERE a.id=$1 AND e.student_id=$2`,
      [assessment_id, req.user.id]
    );
    if (!ok.rowCount) return res.status(403).json({ error: 'Not enrolled in this course' });

    const url = req.file.path;
    const result = await pool.query(
      `INSERT INTO submissions (assessment_id, student_id, file_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (assessment_id, student_id)
       DO UPDATE SET file_url=$3, submitted_at=NOW(), status='submitted'
       WHERE submissions.status IS DISTINCT FROM 'graded'
       RETURNING *`,
      [assessment_id, req.user.id, url]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Already graded, cannot resubmit' });
    res.json({ submission: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload lesson material (staff of the lesson's own school only)
const lessonSchoolOnly = async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.lesson_id)) return res.status(404).json({ error: 'Lesson not found' });
    const r = await pool.query(
      "SELECT c.school_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1",
      [req.params.lesson_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Lesson not found' });
    if (req.user.role !== 'super_admin' && Number(req.user.school_id) !== Number(r.rows[0].school_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router.post('/material/:lesson_id', protect, authorize('super_admin', 'school_admin', 'teacher'), lessonSchoolOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = req.file.path;
    await pool.query("UPDATE lessons SET file_url=$1 WHERE id=$2", [url, req.params.lesson_id]);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
