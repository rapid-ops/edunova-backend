const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { submit, list, getOwn, gradeSubmission } = require('../controllers/submission.controller');

const staff = authorize('super_admin', 'school_admin', 'teacher');
const student = authorize('student');

router.post('/', protect, student, submit);
router.get('/assessment/:assessment_id', protect, staff, list);
router.get('/my/:assessment_id', protect, student, getOwn);
router.put('/:id/grade', protect, staff, gradeSubmission);

module.exports = router;
