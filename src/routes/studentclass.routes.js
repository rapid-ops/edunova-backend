const router = require('express').Router();
const { enroll, bulkAdd, move, listByClass, listByStudent, remove, candidates } = require('../controllers/studentclass.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const bulkLimiter = require('../middleware/ratelimit.middleware').bulkLimiter || ((req, res, next) => next());

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, enroll);
router.post('/bulk', protect, staff, bulkLimiter, bulkAdd);
router.post('/move', protect, staff, bulkLimiter, move);
router.get('/class/:class_id', protect, staff, listByClass);
router.get('/candidates/:class_id', protect, staff, candidates);
router.get('/student/:student_id', protect, listByStudent);
router.delete('/:student_id/:class_id', protect, staff, remove);

module.exports = router;
