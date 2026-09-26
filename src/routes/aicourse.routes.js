const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { generate, list } = require('../controllers/aicourse.controller');
router.post('/generate', protect, generate);
router.get('/:school_id', protect, list);
module.exports = router;
