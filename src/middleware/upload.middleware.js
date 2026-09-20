const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = 'edunova/general';
    if (file.mimetype.startsWith('image/')) folder = 'edunova/images';
    if (file.mimetype === 'application/pdf') folder = 'edunova/documents';
    return {
      folder,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
      resource_type: 'auto',
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = { upload, cloudinary };
