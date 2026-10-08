const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { submit, listBySubmission } = require('../controllers/peerreview.controller');
router.post('/', protect, submit);
router.get('/submission/:submission_id', protect, listBySubmission);
module.exports = router;
