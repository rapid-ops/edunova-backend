const router = require('express').Router();
const { create, byStudent, byCourse, remove } = require('../controllers/enrollment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), create);
router.delete('/', protect, authorize('super_admin','school_admin'), remove);
router.get('/student/:student_id', protect, byStudent);
router.get('/course/:course_id', protect, byCourse);

module.exports = router;
