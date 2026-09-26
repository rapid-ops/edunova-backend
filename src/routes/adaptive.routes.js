const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { update, get } = require('../controllers/adaptive.controller');
router.post('/', protect, update);
router.get('/:student_id/:course_id', protect, get);
module.exports = router;
