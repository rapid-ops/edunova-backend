const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'];

// Sends the file straight to Cloudinary. Replaces the multer-storage-cloudinary package: the installed
// 2.x release does not match this code and stopped the upload, assignment and school image routes from loading.
const storage = {
  _handleFile(req, file, cb) {
    let folder = 'edunova/general';
    if (file.mimetype.startsWith('image/')) folder = 'edunova/images';
    if (file.mimetype === 'application/pdf') folder = 'edunova/documents';
    let done = false;
    const finish = (err, info) => { if (!done) { done = true; cb(err, info); } };
    const out = cloudinary.uploader.upload_stream(
      { folder, allowed_formats: ALLOWED_FORMATS, resource_type: 'auto' },
      (err, result) => {
        if (err) return finish(err);
        finish(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
      }
    );
    file.stream.on('error', (e) => finish(e));
    file.stream.pipe(out);
  },
  _removeFile(req, file, cb) {
    if (!file.filename) return cb(null);
    cloudinary.uploader.destroy(file.filename).then(() => cb(null)).catch(() => cb(null));
  },
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = { upload, cloudinary };
