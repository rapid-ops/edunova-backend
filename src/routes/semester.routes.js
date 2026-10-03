const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, list, activate, remove } = require('../controllers/semester.controller');
const admin = authorize('super_admin', 'school_admin');
router.post('/', protect, admin, create);
router.get('/:batch_id', protect, list);
router.put('/:id/activate', protect, admin, activate);
router.delete('/:id', protect, admin, remove);
module.exports = router;
