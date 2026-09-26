const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { assign, unassign, byTeacher, bySchool, byCourse } = require('../controllers/courseassignment.controller');
router.post('/', protect, assign);
router.delete('/:course_id/:teacher_id', protect, unassign);
router.get('/teacher/:teacher_id', protect, byTeacher);
router.get('/school/:school_id', protect, bySchool);
router.get('/course/:course_id', protect, byCourse);
module.exports = router;
