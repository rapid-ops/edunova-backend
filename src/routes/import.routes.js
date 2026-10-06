const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { sendWhatsApp } = require('../services/whatsapp.service');
const { sendEmail } = require('../services/email.service');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/students', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const school_id = req.body.school_id || req.user?.school_id;

  let rows;
  try {
    rows = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }

  const created = [], failed = [];

  for (const row of rows) {
    try {
      const temp = Math.random().toString(36).slice(-8);
      const hash = await bcrypt.hash(temp, 10);

      // Create student
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [row.email]);
      let studentId;
      if (existing.rows.length) {
        studentId = existing.rows[0].id;
      } else {
        const su = await pool.query(
          `INSERT INTO users (full_name, email, phone, role, school_id, password_hash)
           VALUES ($1,$2,$3,'student',$4,$5) RETURNING id`,
          [row.full_name, row.email, row.phone, school_id, hash]
        );
        studentId = su.rows[0].id;
      }

      // Find/create class
      if (row.class_name) {
        const cls = await pool.query(
          `INSERT INTO classes (name, school_id) VALUES ($1,$2) ON CONFLICT (name, school_id) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [row.class_name, school_id]
        );
        await pool.query(
          `INSERT INTO class_enrollments (student_id, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [studentId, cls.rows[0].id]
        );
      }

      // Create parent
      if (row.parent_email || row.parent_phone) {
        const pe = row.parent_email || `parent_${studentId}@edunova.app`;
        const ppass = Math.random().toString(36).slice(-8);
        const phash = await bcrypt.hash(ppass, 10);
        const ep = await pool.query('SELECT id FROM users WHERE email=$1', [pe]);
        let parentId;
        if (ep.rows.length) { parentId = ep.rows[0].id; }
        else {
          const pu = await pool.query(
            `INSERT INTO users (full_name, email, phone, role, school_id, password_hash)
             VALUES ($1,$2,$3,'parent',$4,$5) RETURNING id`,
            [`Parent of ${row.full_name}`, pe, row.parent_phone, school_id, phash]
          );
          parentId = pu.rows[0].id;
        }
        await pool.query(
          `INSERT INTO parent_student (student_id, parent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [studentId, parentId]
        );
        if (row.parent_phone) {
          const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [school_id]);
          const sname = schoolRes.rows[0]?.name || 'Your school';
          sendWhatsApp(row.parent_phone,
            `👋 Welcome to ${sname} on Edunova!\nHi Parent of ${row.full_name}, your account has been created.\nEmail: ${pe}\nPassword: ${ppass}\nLogin at: https://edunova-frontend-gkaj.vercel.app`
          );
        }
      }

      if (row.phone) {
        const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [school_id]);
        sendWhatsApp(row.phone,
          `👋 Welcome to ${schoolRes.rows[0]?.name || 'Edunova'}!\nHi ${row.full_name}, your account has been created.\nEmail: ${row.email}\nPassword: ${temp}\nLogin at: https://edunova-frontend-gkaj.vercel.app`
        );
      }
      if (row.email) {
        sendEmail(row.email, 'welcome', { name: row.full_name, email: row.email, password: temp, school_name: 'Your School' });
      }

      created.push(row.full_name);
    } catch (err) {
      failed.push({ row: row.full_name || row.email, reason: err.message });
    }
  }

  res.json({ created: created.length, failed: failed.length, errors: failed });
});

module.exports = router;
