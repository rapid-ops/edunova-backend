const router = require('express').Router();
const { create, list, get, remove, my } = require('../controllers/assessment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), create);
router.get('/my', protect, authorize('student'), my);
router.get('/my', protect, authorize('student'), my);
router.get('/course/:course_id', protect, list);
router.get('/:id', protect, get);
router.delete('/:id', protect, authorize('super_admin','school_admin','teacher'), remove);

module.exports = router;
