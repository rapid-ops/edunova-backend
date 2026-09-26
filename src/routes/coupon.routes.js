const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, validate, apply, list, remove } = require('../controllers/coupon.controller');
router.post('/', protect, create);
router.post('/validate', validate);
router.put('/:id/apply', protect, apply);
router.get('/:school_id', protect, list);
router.delete('/:id', protect, remove);
module.exports = router;
