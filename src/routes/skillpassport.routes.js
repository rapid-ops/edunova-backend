const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { get, sync, addExternal, verify } = require('../controllers/skillpassport.controller');
router.get('/:student_id', protect, get);
router.post('/:student_id/sync', protect, sync);
router.post('/:student_id/external', protect, addExternal);
router.get('/verify/:passport_id', verify);
module.exports = router;
