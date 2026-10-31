const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { aiLimiter } = require('../middleware/ratelimit.middleware');
const { canSeeStudent } = require('../utils/access');
const c = require('../controllers/ai.controller');
const a = require('../controllers/aiassistant.controller');
const qz = require('../controllers/aiquiz.controller');
const ex = require('../controllers/aiexam.controller');

const seeStudent = (staff) => async (req, res, next) => {
  try {
    const r = await canSeeStudent(req.user, req.params.student_id || req.body.student_id, staff);
    if (r.error) return res.status(r.code).json({ error: r.error });
    next();
  } catch (e) { res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
};
const staff = ['school_admin', 'teacher'];
const admin = authorize('school_admin');

// no AI call here, so these do not count toward the hourly question limit
router.get('/school-admin-overview', protect, admin, a.schoolAdminOverview);
router.get('/school-admin-chats', protect, admin, a.listChats);
router.get('/school-admin-chats/:id', protect, admin, a.getChat);
router.delete('/school-admin-chats/:id', protect, admin, a.deleteChat);

router.get('/course-generations/:id', protect, authorize('teacher', 'school_admin'), require('../controllers/aicoursestatus.controller').status);
router.use(aiLimiter);
router.post('/generate-quiz', protect, authorize('teacher', 'school_admin'), qz.generateQuiz);
router.post('/generate-exam', protect, authorize('teacher', 'school_admin'), ex.generateExam);
router.post('/generate-course', protect, authorize('teacher', 'school_admin'), c.generateCourse);
router.post('/teacher-copilot', protect, authorize('teacher', 'school_admin'), a.teacherCopilot);
router.post('/school-admin-query', protect, admin, a.schoolAdminQuery);
router.post('/predict-dropout', protect, admin, c.predictDropout);
router.get('/skill-passport/:student_id', protect, seeStudent(staff), c.getSkillPassport);
router.post('/career-match', protect, seeStudent(staff), c.careerMatch);
router.post('/learning-twin/update', protect, seeStudent(staff), c.updateLearningTwin);
router.get('/learning-twin/:student_id', protect, seeStudent(staff), c.getLearningTwin);
router.post('/translate', protect, c.translate);

module.exports = router;
