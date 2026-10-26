const router = require('express').Router();
const multer = require('multer');
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');
const { avatarLimiter } = require('../middleware/ratelimit.middleware');
const { sniffImage, uploadBuffer, destroyImage, idFromUrl } = require('../middleware/imageupload.middleware');

const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const one = (req, res, next) => mem.single('file')(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'This photo is too big. Choose one under 2 MB.' });
  return res.status(400).json({ error: 'We could not read that file. Choose a JPG, PNG or WebP photo.' });
});
const NO_USER = 'Photos cannot be changed with this kind of sign-in.';
const FAIL = 'We could not save your photo. Please try again.';

router.post('/', protect, avatarLimiter, one, async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.status(403).json({ error: NO_USER });
    if (!req.file) return res.status(400).json({ error: 'Choose a photo first.' });
    if (!sniffImage(req.file.buffer)) return res.status(400).json({ error: 'That file is not a photo we can use. Choose a JPG, PNG or WebP photo.' });
    const old = (await pool.query('SELECT avatar_url, avatar_public_id FROM users WHERE id=$1', [req.user.id])).rows[0] || {};
    const up = await uploadBuffer(req.file.buffer, { folder: 'edunova/avatars', public_id: 'u' + req.user.id + '-' + Date.now() });
    await pool.query('UPDATE users SET avatar_url=$1, avatar_public_id=$2 WHERE id=$3', [up.secure_url, up.public_id, req.user.id]);
    const prev = old.avatar_public_id || idFromUrl(old.avatar_url);
    if (prev) destroyImage(prev).catch((e) => console.error('avatar delete error:', e.message));
    res.json({ avatar_url: up.secure_url });
  } catch (err) { console.error('avatar upload error:', err.message); res.status(500).json({ error: FAIL }); }
});

router.delete('/', protect, avatarLimiter, async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.status(403).json({ error: NO_USER });
    const row = (await pool.query('SELECT avatar_url, avatar_public_id FROM users WHERE id=$1', [req.user.id])).rows[0] || {};
    await pool.query('UPDATE users SET avatar_url=NULL, avatar_public_id=NULL WHERE id=$1', [req.user.id]);
    const pid = row.avatar_public_id || idFromUrl(row.avatar_url);
    if (pid) destroyImage(pid).catch((e) => console.error('avatar delete error:', e.message));
    res.json({ avatar_url: null });
  } catch (err) { console.error('avatar remove error:', err.message); res.status(500).json({ error: 'We could not remove your photo. Please try again.' }); }
});

module.exports = router;
