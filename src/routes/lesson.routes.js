const router = require('express').Router();
const { create, list, get, update, remove } = require('../controllers/lesson.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

router.post('/', protect, authorize('super_admin','school_admin','teacher'), create);
router.get('/course/:course_id', protect, list);
router.get('/:id', protect, get);
router.put('/:id', protect, authorize('super_admin','school_admin','teacher'), update);
router.delete('/:id', protect, authorize('super_admin','school_admin'), remove);

module.exports = router;
