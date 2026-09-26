const router = require('express').Router();
const c = require('../controllers/discussion.controller');
const { protect } = require('../middleware/auth.middleware');
router.post('/', protect, c.post);
router.get('/lesson/:lesson_id', protect, c.list);
router.post('/upvote/:id', protect, c.upvote);
router.put('/pin/:id', protect, c.pin);
router.delete('/:id', protect, c.remove);
module.exports = router;
