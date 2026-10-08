const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const c = require('../controllers/ai.controller');

router.post('/generate-quiz', protect, c.generateQuiz);
router.post('/generate-course', protect, c.generateCourse);
router.post('/teacher-copilot', protect, c.teacherCopilot);
router.post('/school-admin-query', protect, c.schoolAdminQuery);
router.post('/predict-dropout', protect, c.predictDropout);
router.get('/skill-passport/:student_id', protect, c.getSkillPassport);
router.post('/career-match', protect, c.careerMatch);
router.post('/learning-twin/update', protect, c.updateLearningTwin);
router.get('/learning-twin/:student_id', protect, c.getLearningTwin);
router.post('/translate', protect, c.translate);

module.exports = router;
