const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const sniffImage = (b) => {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
};

const uploadBuffer = (buffer, opts) => new Promise((resolve, reject) => {
  const s = cloudinary.uploader.upload_stream(
    {
      resource_type: 'image',
      allowed_formats: ['jpg', 'png', 'webp'],
      transformation: [{ width: 512, height: 512, crop: 'limit', flags: 'force_strip' }],
      ...opts,
    },
    (err, r) => (err ? reject(err) : resolve(r))
  );
  s.end(buffer);
});

const destroyImage = (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });

const idFromUrl = (url) => {
  const m = String(url || '').match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(edunova\/.+?)\.[a-z0-9]+$/i);
  return m ? m[1] : null;
};

module.exports = { sniffImage, uploadBuffer, destroyImage, idFromUrl };
