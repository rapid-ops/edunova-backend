const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, list, link, byCourse, remove } = require('../controllers/curriculum.controller');
router.post('/', protect, create);
router.get('/:school_id', protect, list);
router.post('/link', protect, link);
router.get('/course/:course_id', protect, byCourse);
router.delete('/:id', protect, remove);
module.exports = router;
