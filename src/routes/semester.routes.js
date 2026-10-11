const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, list, activate, remove } = require('../controllers/semester.controller');
const admin = authorize('super_admin', 'school_admin');
router.post('/', protect, admin, create);
router.get('/:batch_id', protect, list);
router.put('/:id/activate', protect, admin, activate);
router.delete('/:id', protect, admin, remove);
// School-wide list (used by the academic management page)
router.get('/school/:school_id', protect, async (req, res) => {
  try {
    const pool = require('../config/db');
    const { validId, sameSchool } = require('../utils/access');
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query(`SELECT s.*, b.name AS batch_name FROM semesters s LEFT JOIN batches b ON b.id=s.batch_id WHERE s.school_id=$1 ORDER BY s.start_date NULLS LAST, s.name`, [req.params.school_id]);
    res.json({ semesters: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
