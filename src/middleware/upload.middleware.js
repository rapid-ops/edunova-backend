const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const RAW_EXT = ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'zip'];
const TYPE_ERROR = 'This file type is not allowed. You can upload a PDF, Word, PowerPoint, Excel, text or zip file, or a picture.';

// Sends the file straight to Cloudinary. Replaces the multer-storage-cloudinary package: the installed
// 2.x release does not match this code and stopped the upload, assignment and school image routes from loading.
const storage = {
  _handleFile(req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
    let done = false;
    const finish = (err, info) => { if (!done) { done = true; cb(err, info); } };
    let opts;
    if (IMAGE_EXT.includes(ext)) opts = { folder: 'edunova/images', resource_type: 'image' };
    else if (ext === 'pdf') opts = { folder: 'edunova/documents', resource_type: 'image' };
    else if (RAW_EXT.includes(ext)) {
      const base = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'file';
      opts = { folder: 'edunova/documents', resource_type: 'raw', public_id: `${base}-${Date.now()}.${ext}` };
    } else {
      file.stream.resume();
      return finish(new Error(TYPE_ERROR));
    }
    const out = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return finish(err);
      finish(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
    });
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
