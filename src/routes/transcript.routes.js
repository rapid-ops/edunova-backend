const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { generate, list } = require('../controllers/transcript.controller');
router.post('/generate', protect, generate);
router.get('/student/:student_id', protect, list);
module.exports = router;
