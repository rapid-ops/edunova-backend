const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { analyze, list } = require('../controllers/skillgap.controller');
router.post('/analyze', protect, analyze);
router.get('/:student_id', protect, list);
module.exports = router;
