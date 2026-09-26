const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { scan, list, apply, reject } = require('../controllers/courseevolution.controller');
router.post('/scan', protect, scan);
router.get('/:course_id', protect, list);
router.put('/:id/apply', protect, apply);
router.put('/:id/reject', protect, reject);
module.exports = router;
