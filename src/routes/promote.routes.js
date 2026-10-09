const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool, getClass } = require('../utils/access');
const ADMIN = authorize('super_admin','school_admin');

// GET /api/school-admin/promote/preview?class_id=X — returns students to be promoted
router.get('/promote/preview', protect, ADMIN, async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!validId(class_id)) return res.status(400).json({ error: 'class_id required' });
    const cls = await getClass(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email FROM class_enrollments ce
       JOIN users u ON u.id=ce.student_id WHERE ce.class_id=$1 ORDER BY u.full_name`,
      [cls.id]);
    res.json({ students: r.rows, class: cls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/school-admin/promote — executes promotion
router.post('/promote', protect, ADMIN, async (req, res) => {
  try {
    const { class_id, new_class_id } = req.body;
    if (!validId(class_id) || !validId(new_class_id))
      return res.status(400).json({ error: 'class_id and new_class_id required' });
    if (String(class_id) === String(new_class_id))
      return res.status(400).json({ error: 'class_id and new_class_id must be different' });
    const [cls, newCls] = await Promise.all([getClass(class_id), getClass(new_class_id)]);
    if (!cls || !newCls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id) || Number(cls.school_id) !== Number(newCls.school_id))
      return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      `UPDATE class_enrollments SET class_id=$1 WHERE class_id=$2 RETURNING student_id`,
      [newCls.id, cls.id]);
    res.json({ promoted: result.rowCount, from: cls, to: newCls });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
