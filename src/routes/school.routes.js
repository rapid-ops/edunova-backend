const router = require('express').Router();
const pool = require('../config/db');
const { registerSchool, getSchool, listSchools } = require('../controllers/school.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');

const ownSchool = (req, res, next) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'School not found' });
  if (!sameSchool(req.user, req.params.id)) return res.status(403).json({ error: 'Access denied' });
  next();
};

router.post('/', protect, authorize('super_admin'), registerSchool);
router.get('/', protect, authorize('super_admin'), listSchools);

// Public, field-limited (no auth)
router.get('/public', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.name, s.subdomain, s.logo_url, s.primary_color, s.tagline,
              (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='student') AS student_count
       FROM schools s WHERE s.is_active=true ORDER BY s.name LIMIT 200`
    );
    res.json({ schools: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/public/:subdomain', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.name, s.subdomain, s.logo_url, s.primary_color, s.tagline,
              (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='student') AS student_count,
              (SELECT COUNT(*)::int FROM users u WHERE u.school_id=s.id AND u.role='teacher') AS teacher_count,
              (SELECT COUNT(*)::int FROM courses c WHERE c.school_id=s.id AND c.is_published=true) AS course_count
       FROM schools s WHERE s.subdomain=$1 AND s.is_active=true`,
      [req.params.subdomain]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'School not found' });
    res.json({ school: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public: used by each school's public website
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

router.get('/:id', protect, ownSchool, getSchool);

router.put('/:id/website', protect, authorize('super_admin','school_admin'), ownSchool, async (req, res) => {
  const { external_website_url, website_config } = req.body;
  try {
    const result = await pool.query(
      `UPDATE schools SET external_website_url=$1, website_config=$2 WHERE id=$3 RETURNING *`,
      [external_website_url, website_config, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'School not found' });
    res.json({ school: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const { suspend, reactivate } = require('../controllers/accountlifecycle.controller');
router.post('/users/:user_id/suspend', protect, authorize('super_admin', 'school_admin'), suspend);
router.post('/users/:user_id/reactivate', protect, authorize('super_admin', 'school_admin'), reactivate);
