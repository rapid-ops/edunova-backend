const router = require('express').Router();
const { enroll, listByClass, listByStudent, remove } = require('../controllers/studentclass.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/', protect, enroll);
router.get('/class/:class_id', protect, listByClass);
router.get('/student/:student_id', protect, listByStudent);
router.delete('/:student_id/:class_id', protect, remove);

module.exports = router;
