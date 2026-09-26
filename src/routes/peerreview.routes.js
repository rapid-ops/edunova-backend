const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { submit, credits, spend, list } = require('../controllers/peerreview.controller');
router.post('/', protect, submit);
router.get('/credits/:student_id', protect, credits);
router.post('/spend/:student_id', protect, spend);
router.get('/:submission_id', protect, list);
module.exports = router;
