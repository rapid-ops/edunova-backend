const router = require('express').Router();
const multer = require('multer');
const rl = require('express-rate-limit');
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { cloudinary, sniff, uploadImage, removeImage } = require('../services/imageupload.service');

const rateLimit = rl.rateLimit || rl;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'photo:' + (req.user && req.user.id),
  message: { error: 'You changed your photo several times. Please wait a few minutes and try again.' },
});

const pick = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 } }).single('file');
const parse = (req, res, next) => pick(req, res, (err) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'This photo is too big. Choose one under 2 MB.' });
  return res.status(400).json({ error: 'We could not read that file. Choose a JPG, PNG or WebP photo.' });
});

const SORRY = 'Something went wrong. Please try again.';

// The person is always the signed-in user. Nothing in the body is ever used to pick a user.
router.post('/', protect, limiter, parse, async (req, res) => {
  try {
    const id = req.user.id;
    if (!id) return res.status(403).json({ error: 'Photos can only be changed by a signed-in person.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a photo first.' });
    if (!sniff(req.file.buffer)) return res.status(400).json({ error: 'That file is not a photo we can use. Choose a JPG, PNG or WebP photo.' });
    const old = (await pool.query('SELECT avatar_url, avatar_public_id FROM users WHERE id=$1', [id])).rows[0];
    if (!old) return res.status(404).json({ error: 'Account not found.' });
    let up;
    try {
      up = await uploadImage(req.file.buffer, { folder: 'edunova/avatars', publicId: 'u' + id + '_' + Date.now() });
    } catch (e) {
      console.error('Photo upload failed:', (e && e.message) || e);
      return res.status(502).json({ error: 'We could not save your photo right now. Please try again in a few minutes.' });
    }
    try {
      await pool.query('UPDATE users SET avatar_url=$1, avatar_public_id=$2 WHERE id=$3', [up.secure_url, up.public_id, id]);
    } catch (e) {
      await removeImage(up.public_id, up.secure_url);
      throw e;
    }
    const had = !!(old.avatar_url || old.avatar_public_id);
    const removed = had ? await removeImage(old.avatar_public_id, old.avatar_url) : null;
    res.json({ avatar_url: up.secure_url, removed_previous: removed });
  } catch (err) {
    console.error('Photo save failed:', err.message);
    res.status(500).json({ error: SORRY });
  }
});

router.delete('/', protect, limiter, async (req, res) => {
  try {
    const id = req.user.id;
    if (!id) return res.status(403).json({ error: 'Photos can only be changed by a signed-in person.' });
    const old = (await pool.query('SELECT avatar_url, avatar_public_id FROM users WHERE id=$1', [id])).rows[0];
    if (!old) return res.status(404).json({ error: 'Account not found.' });
    await pool.query('UPDATE users SET avatar_url=NULL, avatar_public_id=NULL WHERE id=$1', [id]);
    const had = !!(old.avatar_url || old.avatar_public_id);
    const removed = had ? await removeImage(old.avatar_public_id, old.avatar_url) : null;
    res.json({ avatar_url: null, removed_previous: removed });
  } catch (err) {
    console.error('Photo removal failed:', err.message);
    res.status(500).json({ error: SORRY });
  }
});

// Super admin only. Reports which settings exist (names, never values) and whether Cloudinary answers.
router.get('/health', protect, authorize('super_admin'), async (req, res) => {
  const env = {};
  ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach((n) => { env[n] = !!process.env[n]; });
  let ping;
  try { const r = await cloudinary.api.ping(); ping = (r && r.status) || 'ok'; }
  catch (e) { ping = 'failed ' + ((e && (e.http_code || (e.error && e.error.http_code))) || 'unknown'); }
  res.json({ env, ping });
});

module.exports = router;
