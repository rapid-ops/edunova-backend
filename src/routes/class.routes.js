const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

// Create class
router.post('/', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { school_id, name, grade_level } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO classes (school_id, name, grade_level)
       VALUES ($1, $2, $3) RETURNING *`,
      [school_id, name, grade_level]
    );
    res.status(201).json({ class: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get classes by school
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM classes WHERE school_id=$1 ORDER BY grade_level, name`,
      [req.params.school_id]
    );
    res.json({ classes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update class
router.put('/:id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const { name, grade_level } = req.body;
  try {
    const result = await pool.query(
      `UPDATE classes SET name=$1, grade_level=$2 WHERE id=$3 RETURNING *`,
      [name, grade_level, req.params.id]
    );
    res.json({ class: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete class
router.delete('/:id', protect, authorize('super_admin','school_admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM classes WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Class deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
