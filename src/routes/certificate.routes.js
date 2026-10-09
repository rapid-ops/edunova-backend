const router = require('express').Router();
const { issue, get, listStudentCerts } = require('../controllers/certificate.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin', 'school_admin', 'teacher'), issue);
router.get('/student/:student_id', protect, listStudentCerts);
router.get('/:student_id/:course_id', get);

module.exports = router;

// GET /api/certificates/verify/:id — public, no auth
router.get('/verify/:id', async (req, res) => {
  try {
    const pool = require('../config/db');
    const id = req.params.id;
    if (!/^\d+$/.test(String(id))) return res.status(404).json({ error: 'Certificate not found' });
    const r = await pool.query(
      `SELECT c.id, c.issued_at, c.certificate_url,
              u.full_name as student_name,
              co.title as course_title,
              s.name as school_name, s.id as school_id
       FROM certificates c
       JOIN users u ON u.id=c.student_id
       JOIN courses co ON co.id=c.course_id
       JOIN schools s ON s.id=c.school_id
       WHERE c.id=$1`, [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ certificate: r.rows[0], verified: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
