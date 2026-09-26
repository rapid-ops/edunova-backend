const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, activate, remove } = require('../controllers/semester.controller');
router.post('/', protect, create);
router.get('/:batch_id', protect, list);
router.put('/:id/activate', protect, activate);
router.delete('/:id', protect, remove);
module.exports = router;
