const router = require('express').Router();
const { cloudinary } = require('../middleware/upload.middleware');

// Opens PDFs stored on Cloudinary through a signed download, because direct delivery of PDFs is switched off on the account.
router.get('/open', async (req, res) => {
  try {
    const u = String(req.query.u || '');
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const m = cloud && u.match(new RegExp('^https://res\\.cloudinary\\.com/' + cloud + '/image/upload/(?:v\\d+/)?(edunova/[A-Za-z0-9_\\-/]+)\\.pdf$'));
    if (!m) return res.status(400).json({ error: 'Invalid file link' });
    const link = cloudinary.utils.private_download_url(m[1], 'pdf', { resource_type: 'image', type: 'upload' });
    const r = await fetch(link);
    if (!r.ok) return res.status(404).json({ error: 'File not found' });
    const buf = Buffer.from(await r.arrayBuffer());
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="document.pdf"', 'Cache-Control': 'private, max-age=300' });
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Could not open the file' });
  }
});

module.exports = router;
