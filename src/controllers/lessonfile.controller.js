const multer = require('multer');
const crypto = require('crypto');
const pool = require('../config/db');
const { validId, sameSchool } = require('../utils/access');

const BUCKET = 'lesson-files';
const MAX_MB = 50;
const DAY = 86400000;
const DENIED = 'You do not have access to this lesson';

let client = null;
const storage = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    if (!client) {
      const { createClient } = require('@supabase/supabase-js');
      client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    }
    return client.storage.from(BUCKET);
  } catch (e) { console.error('Storage setup failed:', e.message); return null; }
};

const EXT = { mp4: 'mp4', mov: 'mp4', webm: 'webm', pdf: 'pdf', docx: 'docx', pptx: 'pptx', jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
const KIND = { mp4: 'video', webm: 'video', pdf: 'pdf', docx: 'docx', pptx: 'pptx', jpg: 'image', png: 'image', gif: 'image', webp: 'image' };
const MIME = {
  mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};
const BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'qt  ', 'M4V ', 'dash', 'MSNV', '3gp4', '3gp5'];

const at = (b, o, s) => b.length >= o + s.length && b.toString('latin1', o, o + s.length) === s;
const detect = (b) => {
  if (at(b, 0, '%PDF-')) return 'pdf';
  if (b[0] === 0x89 && at(b, 1, 'PNG')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (at(b, 0, 'GIF87a') || at(b, 0, 'GIF89a')) return 'gif';
  if (at(b, 0, 'RIFF') && at(b, 8, 'WEBP')) return 'webp';
  if (at(b, 4, 'ftyp') && BRANDS.includes(b.toString('latin1', 8, 12))) return 'mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).includes('webm')) return 'webm';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    if (b.includes('word/document.xml')) return 'docx';
    if (b.includes('ppt/presentation.xml')) return 'pptx';
  }
  return null;
};

const displayName = (n) => String(n || 'file').replace(/[\\/\x00-\x1f]/g, '').trim().slice(-120) || 'file';
const storageName = (n, ext) => {
  const base = String(n || 'file').normalize('NFKD').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
  return `${crypto.randomBytes(8).toString('hex')}-${base}.${ext}`;
};

const loadLesson = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(
    `SELECT l.id, l.course_id, l.drip_days, l.file_path, l.file_name, l.file_type, l.file_size, c.school_id, c.teacher_id
     FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1`, [id]);
  return r.rows[0] || null;
};

const canManage = (user, l) => {
  if (user.role === 'super_admin') return true;
  if (!sameSchool(user, l.school_id)) return false;
  if (user.role === 'school_admin') return true;
  if (user.role === 'teacher') return Number(l.teacher_id) === Number(user.id);
  return false;
};

const guardManage = async (req, res, next) => {
  try {
    const l = await loadLesson(req.params.id);
    if (!l) return res.status(404).json({ error: 'Lesson not found' });
    if (!canManage(req.user, l)) return res.status(403).json({ error: DENIED });
    req.lesson = l;
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } }).single('file');

const upload = (req, res) => {
  const st = storage();
  if (!st) return res.status(503).json({ error: 'File uploads are not set up yet. Please contact support.' });
  parse(req, res, async (mErr) => {
    try {
      if (mErr) {
        const big = mErr.code === 'LIMIT_FILE_SIZE';
        return res.status(big ? 413 : 400).json({ error: big ? `This file is too big. The limit is ${MAX_MB} MB. Try pasting a video link instead.` : 'The file could not be read. Please try again.' });
      }
      if (!req.file) return res.status(400).json({ error: 'Choose a file first.' });
      const ext = (String(req.file.originalname).split('.').pop() || '').toLowerCase();
      const want = EXT[ext];
      if (!want) return res.status(400).json({ error: 'This file type is not allowed. You can upload videos, PDF, Word, PowerPoint and pictures.' });
      const got = detect(req.file.buffer);
      if (got !== want) return res.status(400).json({ error: 'This file does not match its type, so it was not uploaded. Please check the file and try again.' });

      const l = req.lesson;
      const path = `school_${l.school_id}/lesson_${l.id}/${storageName(req.file.originalname, ext)}`;
      const contentType = ext === 'mov' ? 'video/quicktime' : MIME[got];
      const up = await st.upload(path, req.file.buffer, { contentType, upsert: false });
      if (up.error) { console.error('Storage upload failed:', up.error.message); return res.status(502).json({ error: 'The file could not be saved. Please try again.' }); }

      const file = { name: displayName(req.file.originalname), type: KIND[got], size: req.file.size };
      try {
        await pool.query(`UPDATE lessons SET file_path=$1, file_name=$2, file_type=$3, file_size=$4 WHERE id=$5`, [path, file.name, file.type, file.size, l.id]);
      } catch (dbErr) {
        await st.remove([path]).catch(() => {});
        throw dbErr;
      }
      if (l.file_path) await st.remove([l.file_path]).catch(() => {});
      res.status(201).json({ file });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
};

const view = async (req, res) => {
  try {
    const l = await loadLesson(req.params.id);
    if (!l) return res.status(404).json({ error: 'Lesson not found' });
    const role = req.user.role;
    if (!sameSchool(req.user, l.school_id)) return res.status(403).json({ error: DENIED });
    if (role === 'student') {
      const e = await pool.query(`SELECT enrolled_at FROM enrollments WHERE student_id=$1 AND course_id=$2`, [req.user.id, l.course_id]);
      if (!e.rows[0]) return res.status(403).json({ error: DENIED });
      if (Number(l.drip_days) > 0) {
        const at2 = new Date(new Date(e.rows[0].enrolled_at).getTime() + Number(l.drip_days) * DAY);
        if (at2 > new Date()) return res.status(403).json({ error: 'This lesson is not unlocked yet', unlocks_at: at2 });
      }
    } else if (!['super_admin', 'school_admin', 'teacher'].includes(role)) {
      return res.status(403).json({ error: DENIED });
    }
    if (!l.file_path) return res.status(404).json({ error: 'This lesson has no file' });
    const st = storage();
    if (!st) return res.status(503).json({ error: 'File uploads are not set up yet. Please contact support.' });
    const { data, error } = await st.createSignedUrl(l.file_path, 3600);
    if (error || !data) { console.error('Signed link failed:', error && error.message); return res.status(502).json({ error: 'The file could not be opened. Please try again.' }); }
    res.json({ file: { url: data.signedUrl, name: l.file_name, type: l.file_type, size: l.file_size, expires_in: 3600 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const remove = async (req, res) => {
  try {
    const l = req.lesson;
    if (!l.file_path) return res.status(404).json({ error: 'This lesson has no file' });
    const st = storage();
    if (!st) return res.status(503).json({ error: 'File uploads are not set up yet. Please contact support.' });
    const r = await st.remove([l.file_path]);
    if (r.error) return res.status(502).json({ error: 'The file could not be removed. Please try again.' });
    await pool.query(`UPDATE lessons SET file_path=NULL, file_name=NULL, file_type=NULL, file_size=NULL WHERE id=$1`, [l.id]);
    res.json({ message: 'File removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const removeStored = async (path) => { const st = storage(); if (st && path) await st.remove([path]); };

module.exports = { guardManage, upload, view, remove, removeStored };
