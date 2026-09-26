const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { predict, list } = require('../controllers/dropout.controller');
router.post('/predict/:school_id', protect, predict);
router.get('/:school_id', protect, list);
module.exports = router;
