const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, reply, markRead } = require('../controllers/suggestion.controller');
router.post('/', create);
router.get('/:school_id', protect, list);
router.put('/:id/reply', protect, reply);
router.put('/:id/read', protect, markRead);
module.exports = router;
