const pool = require('../config/db');
const { createCourse, getCoursesBySchool, getCourseById, updateCourse, deleteCourse } = require('../models/course.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const schoolOf = async (id) => {
  const r = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [id]);
  return r.rows[0] || null;
};

const create = async (req, res) => {
  try {
    const { class_id, title, description } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    let school_id;
    if (req.user.role === 'super_admin') {
      if (!validId(req.body.school_id)) return res.status(400).json({ error: 'school_id required' });
      school_id = Number(req.body.school_id);
    } else {
      if (req.user.school_id == null) return res.status(403).json({ error: 'Access denied' });
      school_id = req.user.school_id;
    }
    const course = await createCourse({
      school_id,
      class_id: validId(class_id) ? Number(class_id) : null,
      teacher_id: req.user.id,
      title: String(title).trim().slice(0, 255),
      description: description ? String(description).slice(0, 5000) : null,
    });
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    const courses = await getCoursesBySchool(req.params.school_id);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const course = await getCourseById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const c = await schoolOf(req.params.id);
    if (!c) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, c.school_id)) return res.status(403).json({ error: 'Access denied' });
    const { title, description, is_published } = req.body;
    if (title !== undefined && !String(title).trim()) return res.status(400).json({ error: 'title cannot be empty' });
    if (is_published !== undefined && typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published must be true or false' });
    }
    const course = await updateCourse(req.params.id, {
      title: title === undefined ? undefined : String(title).trim().slice(0, 255),
      description: description === undefined ? undefined : String(description).slice(0, 5000),
      is_published,
    });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Course not found' });
    const c = await schoolOf(req.params.id);
    if (!c) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, c.school_id)) return res.status(403).json({ error: 'Access denied' });
    await deleteCourse(req.params.id);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove };
