const router = require('express').Router();
const c = require('../controllers/assessment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { assessmentLimiter } = require('../middleware/ratelimit.middleware');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, assessmentLimiter, c.create);
router.get('/my', protect, authorize('student'), c.my);
router.get('/school-stats', protect, staff, require('../controllers/assessmentstats.controller').stats);
router.get('/course/:course_id', protect, c.list);
router.get('/:id', protect, c.get);
router.put('/:id', protect, staff, c.update);
router.post('/:id/publish', protect, staff, c.publish);
router.post('/:id/unpublish', protect, staff, c.unpublish);
router.post('/:id/close', protect, staff, c.close);
router.post('/:id/reopen', protect, staff, c.reopen);
router.post('/:id/release', protect, staff, c.release);
router.post('/:id/duplicate', protect, staff, assessmentLimiter, c.duplicate);
router.delete('/:id', protect, staff, c.remove);

module.exports = router;
