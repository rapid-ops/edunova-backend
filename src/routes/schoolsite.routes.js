const router = require('express').Router();
const c = require('../controllers/schoolsite.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const admin = authorize('school_admin', 'super_admin');

router.get('/templates', protect, admin, c.templates);
router.get('/templates/:slug', protect, admin, c.templateSchema);
router.get('/templates/:slug/preview', c.templatePreview);
router.get('/mine', protect, admin, c.mine);
router.put('/mine', protect, admin, c.save);
router.post('/preview', protect, admin, c.preview);
router.post('/publish', protect, admin, c.publish);
router.post('/unpublish', protect, admin, c.unpublish);
router.get('/public/:subdomain', c.publicInfo);
router.get('/public/:subdomain/page', c.publicPage);

module.exports = router;
