const { track } = require('../middleware/analytics.middleware');
const router = require('express').Router();
const c = require('../controllers/quiz.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const staff = authorize('super_admin', 'school_admin', 'teacher');
const student = authorize('student');

router.post('/', protect, staff, c.create);
router.get('/me', protect, student, c.myQuizzes);
router.get('/course/:course_id', protect, staff, c.listByCourse);
router.post('/questions', protect, staff, c.addQuestion);
router.delete('/questions/:id', protect, staff, c.removeQuestion);
router.get('/attempts/:assessment_id', protect, staff, c.attempts);
router.get('/manage/:assessment_id', protect, staff, c.manage);
router.put('/settings/:assessment_id', protect, staff, c.updateSettings);
router.get('/attempt-count/:assessment_id/:student_id', protect, c.attemptCount);
router.get('/:assessment_id/info', protect, student, c.info);
router.post('/:assessment_id/start', track('quiz_started'), protect, student, c.start);
router.post('/:assessment_id/submit', track('quiz_submitted'), protect, student, c.submit);

module.exports = router;
