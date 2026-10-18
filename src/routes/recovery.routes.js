const router = require('express').Router();
const { recoveryLimiter, resetLimiter } = require('../middleware/ratelimit.middleware');
const c = require('../controllers/recovery.controller');

router.post('/forgot-password', recoveryLimiter, c.requestReset);
router.post('/reset-password/validate', resetLimiter, c.validateToken);
router.post('/reset-password', resetLimiter, c.completeReset);

module.exports = router;
