const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Real file type from the first bytes, never from the file name or the sent type.
const sniff = (b) => {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(PNG)) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
};

// Incoming transformation: fix rotation, limit to 512px, strip EXIF/IPTC/XMP from the stored original.
const uploadImage = (buf, { folder, publicId }) => new Promise((resolve, reject) => {
  const s = cloudinary.uploader.upload_stream({
    folder,
    public_id: publicId,
    resource_type: 'image',
    allowed_formats: ['jpg', 'png', 'webp'],
    transformation: [{ angle: 'exif' }, { width: 512, height: 512, crop: 'limit', flags: 'force_strip' }],
  }, (err, r) => (err ? reject(err) : resolve(r)));
  s.end(buf);
});

const publicIdFromUrl = (url) => {
  try {
    const u = new URL(String(url));
    if (u.hostname !== 'res.cloudinary.com') return null;
    const m = u.pathname.match(/^\/([^/]+)\/image\/upload\/(?:v\d+\/)?(edunova\/.+)\.[A-Za-z0-9]+$/);
    if (!m || m[1] !== process.env.CLOUDINARY_CLOUD_NAME) return null;
    return decodeURIComponent(m[2]);
  } catch (e) { return null; }
};

// Only ever called with values read from our own database, never from the request.
const removeImage = async (publicId, url) => {
  const id = publicId || publicIdFromUrl(url);
  if (!id || !id.startsWith('edunova/')) return false;
  try {
    const r = await cloudinary.uploader.destroy(id, { resource_type: 'image', invalidate: true });
    return !!r && (r.result === 'ok' || r.result === 'not found');
  } catch (e) { console.error('Image cleanup failed:', e.message); return false; }
};

module.exports = { cloudinary, sniff, uploadImage, removeImage, publicIdFromUrl };
