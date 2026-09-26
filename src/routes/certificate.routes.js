const router = require('express').Router();
const { issue, get, listStudentCerts } = require('../controllers/certificate.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/', protect, issue);
router.get('/:student_id/:course_id', get);
router.get('/student/:student_id', protect, listStudentCerts);

module.exports = router;
