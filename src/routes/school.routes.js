const router = require('express').Router();
const { registerSchool, getSchool, listSchools } = require('../controllers/school.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin'), registerSchool);
router.get('/', protect, authorize('super_admin'), listSchools);
router.get('/:id', protect, getSchool);

module.exports = router;

router.get('/subdomain/:subdomain', async (req, res) => {
  const { findSchoolBySubdomain } = require('../models/school.model');
  try {
    const school = await findSchoolBySubdomain(req.params.subdomain);
    if (!school) return res.status(404).json({ error: 'School not found' });
    res.json({ school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
