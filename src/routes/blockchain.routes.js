const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { issue, byStudent, verify } = require('../controllers/blockchain.controller');
router.post('/', protect, issue);
router.get('/student/:student_id', protect, byStudent);
router.get('/verify/:tx_hash', verify);
module.exports = router;
