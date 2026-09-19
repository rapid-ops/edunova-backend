const router = require('express').Router();
const { create, byStudent, bySchool, updateStatus } = require('../controllers/fee.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin'), create);
router.get('/student/:student_id', protect, byStudent);
router.get('/school/:school_id', protect, authorize('super_admin','school_admin'), bySchool);
router.patch('/:id/status', protect, authorize('super_admin','school_admin'), updateStatus);

module.exports = router;
