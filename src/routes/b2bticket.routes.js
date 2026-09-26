const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, bySchool, all, reply, updateStatus } = require('../controllers/b2bticket.controller');
router.post('/', protect, create);
router.get('/school/:school_id', protect, bySchool);
router.get('/all', protect, all);
router.put('/:id/reply', protect, reply);
router.put('/:id/status', protect, updateStatus);
module.exports = router;
