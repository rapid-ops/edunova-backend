const router = require('express').Router();
const { create, byStudent, byCourse, remove, bulk, selfEnroll, setSelfEnrollment, candidates } = require('../controllers/enrollment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const bulkLimiter = require('../middleware/ratelimit.middleware').bulkLimiter || ((req, res, next) => next());

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, create);
router.post('/bulk', protect, staff, bulkLimiter, bulk);
router.post('/self', protect, authorize('student'), selfEnroll);
router.delete('/', protect, staff, remove);
router.delete('/course/:course_id/student/:student_id', protect, staff, remove);
router.get('/student/:student_id', protect, byStudent);
router.get('/course/:course_id/candidates', protect, staff, candidates);
router.put('/course/:course_id/self-enrollment', protect, staff, setSelfEnrollment);
router.get('/course/:course_id', protect, byCourse);

module.exports = router;
