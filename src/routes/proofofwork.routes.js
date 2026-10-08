const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { create, submitEvidence, verify, listByCourse } = require('../controllers/proofofwork.controller');
router.post('/', protect, create);
router.post('/:id/submit', protect, submitEvidence);
router.put('/submissions/:id/verify', protect, verify);
router.get('/course/:course_id', protect, listByCourse);
module.exports = router;
