const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { issue, byStudent, expiring } = require('../controllers/accreditation.controller');
router.post('/', protect, issue);
router.get('/student/:student_id', protect, byStudent);
router.get('/expiring/:school_id', protect, expiring);
module.exports = router;
