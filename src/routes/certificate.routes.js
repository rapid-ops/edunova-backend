const router = require('express').Router();
const { issue, get, listStudentCerts } = require('../controllers/certificate.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin', 'school_admin', 'teacher'), issue);
router.get('/student/:student_id', protect, listStudentCerts);
router.get('/:student_id/:course_id', get);

module.exports = router;
