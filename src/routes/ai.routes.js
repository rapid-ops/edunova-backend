const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { aiLimiter } = require('../middleware/ratelimit.middleware');
const { canSeeStudent } = require('../utils/access');
const c = require('../controllers/ai.controller');
const a = require('../controllers/aiassistant.controller');

const seeStudent = (staff) => async (req, res, next) => {
  try {
    const r = await canSeeStudent(req.user, req.params.student_id || req.body.student_id, staff);
    if (r.error) return res.status(r.code).json({ error: r.error });
    next();
  } catch (e) { res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
};
const staff = ['school_admin', 'teacher'];

router.use(aiLimiter);
router.post('/generate-quiz', protect, authorize('teacher', 'school_admin'), c.generateQuiz);
router.post('/generate-course', protect, authorize('teacher', 'school_admin'), c.generateCourse);
router.post('/teacher-copilot', protect, authorize('teacher', 'school_admin'), a.teacherCopilot);
router.post('/school-admin-query', protect, authorize('school_admin'), a.schoolAdminQuery);
router.get('/school-admin-overview', protect, authorize('school_admin'), a.schoolAdminOverview);
router.post('/predict-dropout', protect, authorize('school_admin'), c.predictDropout);
router.get('/skill-passport/:student_id', protect, seeStudent(staff), c.getSkillPassport);
router.post('/career-match', protect, seeStudent(staff), c.careerMatch);
router.post('/learning-twin/update', protect, seeStudent(staff), c.updateLearningTwin);
router.get('/learning-twin/:student_id', protect, seeStudent(staff), c.getLearningTwin);
router.post('/translate', protect, c.translate);

module.exports = router;
