const router = require('express').Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth.middleware');
const { importLimiter, inviteLimiter } = require('../middleware/ratelimit.middleware');
const c = require('../controllers/import.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const admin = [protect, authorize('school_admin', 'super_admin')];
const file = (req, res, next) => upload.single('file')(req, res, (err) => (
  err ? res.status(400).json({ error: 'The file is too large or could not be read. Use a CSV file under 1 MB.' }) : next()
));

router.post('/students', ...admin, importLimiter, file, c.importPeople);
router.get('/invitations', ...admin, c.pendingInvites);
router.post('/invitations', ...admin, inviteLimiter, c.sendInvites);

module.exports = router;
