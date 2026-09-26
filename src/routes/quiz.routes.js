const router = require('express').Router();
const { createQuestion, listQuestions, removeQuestion, submit, getStudentAttempt, listAttempts } = require('../controllers/quiz.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/questions', protect, createQuestion);
router.get('/questions/:assessment_id', protect, listQuestions);
router.delete('/questions/:id', protect, removeQuestion);
router.post('/submit', protect, submit);
router.get('/attempt/:assessment_id/:student_id', protect, getStudentAttempt);
router.get('/attempts/:assessment_id', protect, listAttempts);

module.exports = router;
