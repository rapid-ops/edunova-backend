const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, remove } = require('../controllers/program.controller');
router.post('/', protect, create);
router.get('/:department_id', protect, list);
router.delete('/:id', protect, remove);
module.exports = router;
