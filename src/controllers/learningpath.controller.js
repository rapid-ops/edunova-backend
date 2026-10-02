const pool = require('../config/db');
const m = require('../models/learningpath.model');
const { validId, sameSchool, canSeeStudent, getCourse } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });

const schoolForCreate = (req, res) => {
  if (req.user.role === 'super_admin') {
    if (!validId(req.body.school_id)) { res.status(400).json({ error: 'school_id required' }); return null; }
    return Number(req.body.school_id);
  }
  if (req.user.school_id == null) { res.status(403).json({ error: 'Access denied' }); return null; }
  return req.user.school_id;
};

const pathOf = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(`SELECT id, school_id FROM learning_paths WHERE id=$1`, [id]);
  return r.rows[0] || null;
};
const loadPath = async (req, res, id) => {
  const p = await pathOf(id);
  if (!p) { res.status(404).json({ error: 'Path not found' }); return null; }
  if (!sameSchool(req.user, p.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return p;
};

const createPath = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const path = await m.create({
      school_id,
      title: String(title).trim().slice(0, 255),
      description: description ? String(description).slice(0, 2000) : null,
    });
    res.status(201).json({ path });
  } catch (err) { fail(res, err); }
};

const addCourse = async (req, res) => {
  try {
    const { path_id, course_id, position } = req.body;
    if (!validId(path_id) || !validId(course_id)) return res.status(400).json({ error: 'path_id and course_id required' });
    const p = await loadPath(req, res, path_id);
    if (!p) return;
    const c = await getCourse(course_id);
    if (!c || Number(c.school_id) !== Number(p.school_id)) return res.status(404).json({ error: 'Course not found in this school' });
    const pos = position === undefined || position === null || position === '' ? 0 : Number(position);
    if (!Number.isInteger(pos) || pos < 0 || pos > 1000) return res.status(400).json({ error: 'Invalid position' });
    const lpc = await m.addCourse({ path_id: p.id, course_id: c.id, position: pos });
    res.json({ lpc });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ paths: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const removeCourse = async (req, res) => {
  try {
    const p = await loadPath(req, res, req.params.path_id);
    if (!p) return;
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    await m.removeCourse(p.id, req.params.course_id);
    res.json({ message: 'Removed' });
  } catch (err) { fail(res, err); }
};

const removePath = async (req, res) => {
  try {
    const p = await loadPath(req, res, req.params.id);
    if (!p) return;
    await m.remove(p.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

const checkUnlock = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    const p = await pathOf(req.params.path_id);
    if (!p || Number(p.school_id) !== Number(access.student.school_id) || !validId(req.params.course_id)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    res.json({ unlocked: await m.isUnlocked(access.student.id, p.id, req.params.course_id) });
  } catch (err) { fail(res, err); }
};

module.exports = { createPath, addCourse, list, removeCourse, removePath, checkUnlock };
