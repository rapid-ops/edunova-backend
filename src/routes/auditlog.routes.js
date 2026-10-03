const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { list } = require('../controllers/auditlog.controller');
router.get('/:school_id', protect, authorize('super_admin', 'school_admin'), list);
module.exports = router;
