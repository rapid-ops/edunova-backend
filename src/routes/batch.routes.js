const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, list, remove } = require('../controllers/batch.controller');
const admin = authorize('super_admin', 'school_admin');
router.post('/', protect, admin, create);
router.get('/:program_id', protect, list);
router.delete('/:id', protect, admin, remove);
// School-wide list (used by the academic management page)
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    const pool = require('../config/db');
    const { validId, sameSchool } = require('../utils/access');
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(`SELECT b.*, p.name AS program_name FROM batches b LEFT JOIN programs p ON p.id=b.program_id WHERE b.school_id=$1 ORDER BY b.start_date NULLS LAST, b.name`, [req.params.school_id]);
    res.json({ batches: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
