const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { recommend } = require('../controllers/personalization.controller');
router.post('/recommend', protect, recommend);
module.exports = router;
