const router = require('express').Router();
const c = require('../controllers/gradebook.controller');
const { protect } = require('../middleware/auth.middleware');
router.post('/', protect, c.grade);
router.get('/student/:student_id/:course_id', protect, c.studentGrades);
router.get('/course/:course_id', protect, c.courseGrades);
router.get('/gpa/:student_id/:school_id', protect, c.gpa);
module.exports = router;
