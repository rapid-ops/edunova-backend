const router = require('express').Router();
const { upload } = require('../middleware/upload.middleware');
const { protect, authorize } = require('../middleware/auth.middleware');

const own = (req, res, next) => {
  const u = req.user || {};
  if (u.role === 'super_admin' || (u.school_id && String(u.school_id) === String(req.params.school_id))) return next();
  res.status(403).json({ error: 'Not your school' });
};

router.post('/website-image/:school_id', protect, authorize('super_admin', 'school_admin'), own, upload.single('file'), (req, res) => {
  const f = req.file;
  if (!f || !f.path) return res.status(400).json({ error: 'No image received' });
  res.json({ url: f.path });
});

module.exports = router;
