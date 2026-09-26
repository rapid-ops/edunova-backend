const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { get, analyze } = require('../controllers/learningtwin.controller');
router.get('/:student_id', protect, get);
router.post('/:student_id/analyze', protect, analyze);
module.exports = router;
