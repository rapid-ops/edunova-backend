const router = require('express').Router();
const multer = require('multer');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const { Readable } = require('stream');
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/students', protect, authorize('super_admin','school_admin'), upload.single('file'), async (req, res) => {
  const { school_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const results = [];
  const errors = [];
  const rows = [];

  try {
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      stream.pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    for (const row of rows) {
      const { full_name, email, password } = row;
      if (!full_name || !email || !password) {
        errors.push({ email, error: 'Missing fields' });
        continue;
      }
      try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
          `INSERT INTO users (school_id, full_name, email, password, role)
           VALUES ($1, $2, $3, $4, 'student')
           ON CONFLICT (email) DO NOTHING
           RETURNING id, full_name, email`,
          [school_id, full_name, email, hashed]
        );
        if (result.rows[0]) results.push(result.rows[0]);
        else errors.push({ email, error: 'Email already exists' });
      } catch (err) {
        errors.push({ email, error: err.message });
      }
    }

    res.json({
      imported: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
