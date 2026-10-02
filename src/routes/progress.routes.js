const router = require('express').Router();
const { updateProgress, getCourseProgressHandler } = require('../controllers/progress.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('student'), updateProgress);
router.get('/:student_id/:course_id', protect, getCourseProgressHandler);

module.exports = router;
