const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { chat, getSession } = require('../controllers/aitutor.controller');
router.post('/chat', protect, chat);
router.get('/session/:student_id/:course_id', protect, getSession);
module.exports = router;
