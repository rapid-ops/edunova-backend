const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, listBySchool, listByUser, updateStatus, reply, replies } = require('../controllers/ticket.controller');

const admin = authorize('super_admin', 'school_admin');

router.post('/', protect, create);
router.get('/school/:school_id', protect, admin, listBySchool);
router.get('/user/:user_id', protect, listByUser);
router.put('/:id/status', protect, admin, updateStatus);
router.post('/reply', protect, reply);
router.get('/:ticket_id/replies', protect, replies);

module.exports = router;
