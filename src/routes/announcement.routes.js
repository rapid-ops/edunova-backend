const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { create, forStudent, forTeacher, bySchool, remove } = require('../controllers/announcement.controller');

const staff = authorize('super_admin', 'school_admin', 'teacher');

router.post('/', protect, staff, create);
router.get('/student/:student_id/:school_id', protect, forStudent);
router.get('/teacher/:teacher_id/:school_id', protect, forTeacher);
router.get('/school/:school_id', protect, bySchool);
router.delete('/:id', protect, staff, remove);

module.exports = router;
