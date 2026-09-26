const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, remove } = require('../controllers/batch.controller');
router.post('/', protect, create);
router.get('/:program_id', protect, list);
router.delete('/:id', protect, remove);
module.exports = router;
