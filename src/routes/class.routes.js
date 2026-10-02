const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, getClass } = require('../utils/access');

const admin = authorize('super_admin','school_admin');

// Create class (school comes from the logged-in admin)
router.post('/', protect, admin, async (req, res) => {
  const { name, grade_level } = req.body;
  try {
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `INSERT INTO classes (school_id, name, grade_level)
       VALUES ($1, $2, $3) RETURNING *`,
      [school_id, String(name).trim().slice(0, 100), grade_level === undefined ? null : grade_level]
    );
    res.status(201).json({ class: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get classes by school
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
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
router.put('/:id', protect, admin, async (req, res) => {
  const { name, grade_level } = req.body;
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: 'name cannot be empty' });
    const result = await pool.query(
      `UPDATE classes SET name=COALESCE($1, name), grade_level=COALESCE($2, grade_level) WHERE id=$3 RETURNING *`,
      [name === undefined ? null : String(name).trim().slice(0, 100), grade_level === undefined ? null : grade_level, cls.id]
    );
    res.json({ class: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete class
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const cls = await getClass(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query(`DELETE FROM classes WHERE id=$1`, [cls.id]);
    res.json({ message: 'Class deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
