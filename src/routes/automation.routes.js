const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, toggle, remove, trigger } = require('../controllers/automation.controller');
router.post('/', protect, create);
router.get('/:school_id', protect, list);
router.put('/:id/toggle', protect, toggle);
router.delete('/:id', protect, remove);
router.post('/trigger', protect, trigger);
module.exports = router;
