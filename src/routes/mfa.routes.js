const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { enableMFA, verifyAndActivateMFA, verifyMFALogin, disableMFA, useBackupCode } = require('../controllers/mfa.controller');

router.post('/enable', protect, enableMFA);
router.post('/activate', protect, verifyAndActivateMFA);
router.post('/verify-login', verifyMFALogin);
router.post('/disable', protect, disableMFA);
router.post('/backup-code', useBackupCode);

module.exports = router;
