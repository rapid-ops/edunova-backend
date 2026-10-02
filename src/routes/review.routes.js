const router = require('express').Router();
const c = require('../controllers/review.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.get('/course/:course_id', protect, c.get);
router.put('/course/:course_id', protect, authorize('student'), c.upsert);
router.delete('/course/:course_id/mine', protect, authorize('student'), c.removeMine);
router.delete('/:id', protect, authorize('school_admin', 'super_admin'), c.moderate);

module.exports = router;
