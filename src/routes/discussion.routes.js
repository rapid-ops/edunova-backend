const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, upvote, pin, remove } = require('../controllers/discussion.controller');
router.post('/', protect, create);
router.get('/:lesson_id', protect, list);
router.post('/:id/upvote', protect, upvote);
router.put('/:id/pin', protect, pin);
router.delete('/:id', protect, remove);
module.exports = router;
