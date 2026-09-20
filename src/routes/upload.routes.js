const router = require('express').Router();
const { upload, cloudinary } = require('../middleware/upload.middleware');
const { protect } = require('../middleware/auth.middleware');
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

// Upload school logo
router.post('/logo/:school_id', protect, upload.single('file'), async (req, res) => {
  try {
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

// Upload assignment submission
router.post('/submission', protect, upload.single('file'), async (req, res) => {
  try {
    const { assessment_id, student_id } = req.body;
    const url = req.file.path;
    const result = await pool.query(
      `INSERT INTO submissions (assessment_id, student_id, file_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (assessment_id, student_id)
       DO UPDATE SET file_url=$3, submitted_at=NOW()
       RETURNING *`,
      [assessment_id, student_id, url]
    );
    res.json({ submission: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload lesson material
router.post('/material/:lesson_id', protect, upload.single('file'), async (req, res) => {
  try {
    const url = req.file.path;
    await pool.query(
      `UPDATE lessons SET file_url=$1 WHERE id=$2`,
      [url, req.params.lesson_id]
    );
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
