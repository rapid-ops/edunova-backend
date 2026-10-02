const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, validate, apply, list, remove } = require('../controllers/coupon.controller');

const admin = authorize('super_admin', 'school_admin');

router.post('/', protect, admin, create);
router.post('/validate', validate);
router.put('/:id/apply', protect, admin, apply);
router.get('/:school_id', protect, admin, list);
router.delete('/:id', protect, admin, remove);

module.exports = router;
