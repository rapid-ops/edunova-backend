const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, forStudent, forTeacher, bySchool, remove } = require('../controllers/announcement.controller');
router.post('/', protect, create);
router.get('/student/:student_id/:school_id', protect, forStudent);
router.get('/teacher/:teacher_id/:school_id', protect, forTeacher);
router.get('/school/:school_id', protect, bySchool);
router.delete('/:id', protect, remove);
module.exports = router;
