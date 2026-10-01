const router = require('express').Router();
const c = require('../controllers/assignment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

const staff = authorize('super_admin', 'school_admin', 'teacher');
const staffOrStudent = authorize('super_admin', 'school_admin', 'teacher', 'student');

const uploadOne = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10MB)' : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    next();
  });
};

router.post('/', protect, staff, c.create);
router.get('/me', protect, authorize('student'), c.myAssignments);
router.get('/child/:student_id', protect, authorize('parent'), c.childAssignments);
router.get('/course/:course_id', protect, staff, c.listByCourse);
router.put('/submissions/:submission_id/grade', protect, staff, c.gradeSubmission);
router.get('/:id', protect, staffOrStudent, c.detail);
router.post('/:id/submit', protect, authorize('student'), uploadOne, c.submit);
router.get('/:id/submissions', protect, staff, c.submissions);

module.exports = router;
