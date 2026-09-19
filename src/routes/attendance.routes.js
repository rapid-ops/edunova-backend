const router = require('express').Router();
const { mark, byClass, byStudent } = require('../controllers/attendance.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), mark);
router.get('/class/:class_id', protect, byClass);
router.get('/student/:student_id', protect, byStudent);

module.exports = router;
