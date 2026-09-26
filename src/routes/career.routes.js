const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { match, list } = require('../controllers/career.controller');
router.post('/match', protect, match);
router.get('/:student_id', protect, list);
module.exports = router;
