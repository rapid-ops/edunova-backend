const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, byCourse, saveProgress, getProgress } = require('../controllers/scorm.controller');
router.post('/', protect, create);
router.get('/course/:course_id', protect, byCourse);
router.post('/progress', protect, saveProgress);
router.get('/progress/:package_id/:student_id', protect, getProgress);
module.exports = router;
