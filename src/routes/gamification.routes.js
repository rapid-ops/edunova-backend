const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const c = require('../controllers/gamification.controller');

router.get('/profile/:student_id', protect, c.getProfile);
router.get('/leaderboard/:school_id', protect, c.getLeaderboard);
router.get('/badges/:school_id', protect, c.getBadges);
router.post('/badges', protect, authorize('school_admin', 'super_admin'), c.createBadge);
router.post('/award', protect, authorize('school_admin', 'super_admin'), c.award);

module.exports = router;
