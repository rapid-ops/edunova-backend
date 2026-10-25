const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { aiLimiter } = require('../middleware/ratelimit.middleware');
const { chat, getSession } = require('../controllers/aitutor.controller');
router.use(aiLimiter);
router.post('/chat', protect, authorize('student'), chat);
router.get('/session/:student_id/:course_id', protect, authorize('student'), getSession);
module.exports = router;
