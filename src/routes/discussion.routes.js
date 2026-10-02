const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, list, upvote, pin, remove } = require('../controllers/discussion.controller');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, authorize('student', 'teacher', 'school_admin', 'super_admin'), create);
router.get('/:lesson_id', protect, list);
router.post('/:id/upvote', protect, upvote);
router.put('/:id/pin', protect, staff, pin);
router.delete('/:id', protect, remove);

module.exports = router;
