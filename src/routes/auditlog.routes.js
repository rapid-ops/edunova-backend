const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { list } = require('../controllers/auditlog.controller');
router.get('/:school_id', protect, list);
module.exports = router;
