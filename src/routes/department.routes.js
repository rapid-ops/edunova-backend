const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, list, remove } = require('../controllers/department.controller');

const admin = authorize('super_admin', 'school_admin');

router.post('/', protect, admin, create);
router.get('/:school_id', protect, list);
router.delete('/:id', protect, admin, remove);

module.exports = router;
