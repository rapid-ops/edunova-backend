const pool = require('../config/db');
const m = require('../models/announcement.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass, getCourse } = require('../utils/access');

const STAFF = ['super_admin', 'school_admin', 'teacher'];
const fail = (res, err) => res.status(500).json({ error: err.message });

const create = async (req, res) => {
  try {
    const { title, body, target_role, class_id, course_id } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    const role = target_role || 'all';
    if (!['all', 'student', 'teacher', 'parent'].includes(role)) return res.status(400).json({ error: 'Invalid target_role' });
    let school_id = req.user.school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    }
    if (school_id == null) return res.status(403).json({ error: 'Access denied' });
    if (class_id) {
      const c = await getClass(class_id);
      if (!c || Number(c.school_id) !== Number(school_id)) return res.status(400).json({ error: 'Class not found in this school' });
    }
    if (course_id) {
      const c = await getCourse(course_id);
      if (!c || Number(c.school_id) !== Number(school_id)) return res.status(400).json({ error: 'Course not found in this school' });
    }
    const a = await m.create({
      school_id,
      created_by: req.user.id,
      title: String(title).trim().slice(0, 255),
      body: body ? String(body).slice(0, 5000) : null,
      target_role: role,
      class_id: class_id || null,
      course_id: course_id || null,
    });
    res.status(201).json({ announcement: a });
  } catch (err) { fail(res, err); }
};

const forStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ announcements: await m.getForStudent(access.student.id, access.student.school_id) });
  } catch (err) { fail(res, err); }
};

const forTeacher = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const target = await getUser(req.params.teacher_id);
    if (!target) return res.status(404).json({ error: 'Teacher not found' });
    if (req.user.role === 'teacher' && Number(req.user.id) !== Number(target.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!sameSchool(req.user, target.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ announcements: await m.getForTeacher(target.id, target.school_id) });
  } catch (err) { fail(res, err); }
};

const bySchool = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ announcements: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Announcement not found' });
    const r = await pool.query(`SELECT school_id, created_by FROM announcements WHERE id=$1`, [req.params.id]);
    const a = r.rows[0];
    if (!a) return res.status(404).json({ error: 'Announcement not found' });
    if (!sameSchool(req.user, a.school_id)) return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'teacher' && Number(a.created_by) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'You can only delete your own announcements' });
    }
    await m.remove(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, forStudent, forTeacher, bySchool, remove };
