const router = require('express').Router();
const { create, list, get, update, remove } = require('../controllers/course.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), create);
router.get('/public', async (req, res) => {
  try {
    const pool = require('../config/db');
    const sid = /^\d+$/.test(String(req.query.school_id || '')) ? Number(req.query.school_id) : null;
    const r = await pool.query(
      `SELECT c.id, c.title, LEFT(c.description, 200) AS description, c.school_id, s.name AS school_name, s.subdomain
       FROM courses c JOIN schools s ON s.id=c.school_id
       WHERE c.is_published=true AND s.is_active=true AND ($1::int IS NULL OR c.school_id=$1)
       ORDER BY c.created_at DESC LIMIT 100`,
      [sid]
    );
    res.json({ courses: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/school/:school_id', protect, list);
router.get('/:id', protect, get);
router.put('/:id', protect, authorize('super_admin','school_admin','teacher'), update);
router.delete('/:id', protect, authorize('super_admin','school_admin'), remove);

module.exports = router;
