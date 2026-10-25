const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth.middleware');
const { peopleLimiter, inviteLimiter } = require('../middleware/ratelimit.middleware');
const c = require('../controllers/people.controller');

const admin = [protect, authorize('school_admin', 'super_admin')];
router.get('/', ...admin, c.list);
router.post('/', ...admin, peopleLimiter, c.create);
router.get('/:id', ...admin, c.detail);
router.patch('/:id', ...admin, peopleLimiter, c.update);
router.post('/:id/invite', ...admin, inviteLimiter, c.invite);
router.post('/:id/parents', ...admin, peopleLimiter, c.linkParent);
router.delete('/:id/parents/:parent_id', ...admin, peopleLimiter, c.unlinkParent);

module.exports = router;
