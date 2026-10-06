const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { generate, list, revoke } = require('../controllers/apikey.controller');
const admin = authorize('super_admin', 'school_admin');

router.post('/', protect, admin, generate);
router.get('/', protect, admin, list);
router.delete('/:id', protect, admin, revoke);

module.exports = router;
