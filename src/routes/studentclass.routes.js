const router = require('express').Router();
const { enroll, listByClass, listByStudent, remove } = require('../controllers/studentclass.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, enroll);
router.get('/class/:class_id', protect, staff, listByClass);
router.get('/student/:student_id', protect, listByStudent);
router.delete('/:student_id/:class_id', protect, staff, remove);

module.exports = router;
