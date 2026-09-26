const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, byCourse, submit, submissions, remove } = require('../controllers/virtuallab.controller');
router.post('/', protect, create);
router.get('/course/:course_id', protect, byCourse);
router.post('/submit', protect, submit);
router.get('/:lab_id/submissions', protect, submissions);
router.delete('/:id', protect, remove);
module.exports = router;
