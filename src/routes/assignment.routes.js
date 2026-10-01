const router = require('express').Router();
const c = require('../controllers/assignment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, c.create);
router.get('/me', protect, authorize('student'), c.myAssignments);
router.get('/child/:student_id', protect, authorize('parent'), c.childAssignments);
router.get('/course/:course_id', protect, c.listByCourse);
router.put('/submissions/:submission_id/grade', protect, staff, c.gradeSubmission);
router.get('/:id', protect, c.detail);
router.post('/:id/submit', protect, authorize('student'), upload.single('file'), c.submit);
router.get('/:id/submissions', protect, staff, c.submissions);

module.exports = router;
