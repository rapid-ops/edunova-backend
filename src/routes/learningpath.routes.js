const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { createPath, addCourse, list, removeCourse, removePath, checkUnlock } = require('../controllers/learningpath.controller');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, createPath);
router.post('/course', protect, staff, addCourse);
router.get('/unlock/:student_id/:path_id/:course_id', protect, checkUnlock);
router.get('/:school_id', protect, list);
router.delete('/:path_id/course/:course_id', protect, staff, removeCourse);
router.delete('/:id', protect, staff, removePath);

module.exports = router;
