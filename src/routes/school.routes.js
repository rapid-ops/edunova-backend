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

// Public onboarding endpoint - no auth required
router.post('/onboard', async (req, res) => {
  const { createSchool, findSchoolBySubdomain } = require('../models/school.model');
  try {
    const { name, email, phone, address, subdomain } = req.body;
    if (!name || !email || !subdomain) {
      return res.status(400).json({ error: 'Name, email and subdomain required' });
    }
    const existing = await findSchoolBySubdomain(subdomain);
    if (existing) return res.status(400).json({ error: 'Subdomain already taken' });
    const school = await createSchool({ name, email, phone, address, subdomain });
    res.status(201).json({ school });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/website', protect, authorize('super_admin','school_admin'), async (req, res) => {
  const pool = require('../config/db');
  const { mode, external_website_url, website_config } = req.body;
  try {
    const result = await pool.query(
      `UPDATE schools SET external_website_url=$1, website_config=$2 WHERE id=$3 RETURNING *`,
      [external_website_url, website_config, req.params.id]
    );
    res.json({ school: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
