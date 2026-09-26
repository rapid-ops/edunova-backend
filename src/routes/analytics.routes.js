const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { track, cohort, dropout, completion, instructor } = require('../controllers/analytics.controller');
router.post('/track', protect, track);
router.get('/cohort/:school_id', protect, cohort);
router.get('/dropout/:school_id', protect, dropout);
router.get('/completion/:school_id', protect, completion);
router.get('/instructor/:school_id', protect, instructor);
module.exports = router;
