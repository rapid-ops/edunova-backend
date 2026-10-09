const router = require('express').Router();
const { create, list, update, remove } = require('../controllers/calendar.controller');
const { protect, authorize } = require('../middleware/auth.middleware');
const ADMIN = authorize('super_admin','school_admin');
router.post('/', protect, ADMIN, create);
router.get('/school/:school_id', protect, list);
router.put('/:id', protect, ADMIN, update);
router.delete('/:id', protect, ADMIN, remove);
module.exports = router;
