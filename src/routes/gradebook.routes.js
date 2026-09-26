const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { upsert, studentGrades, courseGradebook, gpa } = require('../controllers/gradebook.controller');
router.post('/', protect, upsert);
router.get('/student/:student_id/:course_id', protect, studentGrades);
router.get('/course/:course_id', protect, courseGradebook);
router.get('/gpa/:student_id/:school_id', protect, gpa);
module.exports = router;
