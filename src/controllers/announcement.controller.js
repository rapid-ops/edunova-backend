const pool = require('../config/db');
const m = require('../models/announcement.model');
const { validId, sameSchool, canSeeStudent, getUser } = require('../utils/access');
const { sendWhatsApp } = require('../services/whatsapp.service');

const STAFF = ['super_admin', 'school_admin', 'teacher'];

const create = async (req, res) => {
  try {
    const { title, body, target_roles, class_id } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    const a = await m.create({
      school_id,
      created_by: req.user.id,
      title: String(title).trim().slice(0, 255),
      body: body ? String(body).slice(0, 5000) : null,
      target_roles: Array.isArray(target_roles) ? target_roles : [],
      class_id: validId(class_id) ? Number(class_id) : null,
    });

    // WhatsApp to targeted users
    try {
      const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [school_id]);
      const schoolName = schoolRes.rows[0]?.name || 'School';
      const roles = Array.isArray(target_roles) && target_roles.length ? target_roles : null;
      let q = 'SELECT phone FROM users WHERE school_id=$1 AND phone IS NOT NULL';
      const params = [school_id];
      if (roles) { q += ' AND role = ANY($2)'; params.push(roles); }
      const users = await pool.query(q, params);
      for (const u of users.rows) {
        sendWhatsApp(u.phone, `📢 ${schoolName}\n${title}\n\n${body || ''}`);
      }
    } catch (e) {
      console.error('Announcement WA error:', e.message);
    }

    res.status(201).json({ announcement: a });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const forStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ announcements: await m.getForStudent(access.student.id, access.student.school_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const forTeacher = async (req, res) => {
  try {
    if (!validId(req.params.teacher_id)) return res.status(404).json({ error: 'Teacher not found' });
    const target = await getUser(req.params.teacher_id);
    if (!target || target.role !== 'teacher') return res.status(404).json({ error: 'Teacher not found' });
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ announcements: await m.getForTeacher(target.id, target.school_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bySchool = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ announcements: await m.getBySchool(req.params.school_id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Announcement not found' });
    const a = await pool.query('SELECT school_id FROM announcements WHERE id=$1', [req.params.id]);
    if (!a.rows[0]) return res.status(404).json({ error: 'Announcement not found' });
    if (!sameSchool(req.user, a.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    await pool.query('DELETE FROM announcements WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, forStudent, forTeacher, bySchool, remove };
