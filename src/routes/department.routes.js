const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, remove } = require('../controllers/department.controller');
router.post('/', protect, create);
router.get('/:school_id', protect, list);
router.delete('/:id', protect, remove);
module.exports = router;
