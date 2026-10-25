const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { student, parent, teacher } = require('../controllers/portaldashboard.controller');

router.get('/student/:id', protect, student);
router.get('/parent/:id', protect, parent);
router.get('/teacher/:id', protect, teacher);

module.exports = router;
