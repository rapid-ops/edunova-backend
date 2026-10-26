const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { assign, unassign, byTeacher, bySchool, byCourse, overview } = require('../controllers/courseassignment.controller');

const admin = authorize('super_admin', 'school_admin');

router.post('/', protect, admin, assign);
router.delete('/:course_id/:teacher_id', protect, admin, unassign);
router.get('/teacher/:teacher_id', protect, byTeacher);
router.get('/school/:school_id', protect, bySchool);
router.get('/overview/:school_id', protect, admin, overview);
router.get('/course/:course_id', protect, byCourse);

module.exports = router;
