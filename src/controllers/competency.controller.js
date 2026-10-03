const m = require('../models/competency.model');
const { validId, sameSchool, canSeeStudent, getUser, getCourse, schoolOfRow, schoolForCreate } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });

const create = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const c = await m.create({ school_id, name: String(name).trim().slice(0, 255), description: description ? String(description).slice(0, 2000) : null });
    res.status(201).json({ competency: c });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ competencies: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

// Loads a course and a competency and checks both belong to the caller's school.
const pair = async (req, res, course_id, competency_id) => {
  if (!validId(course_id) || !validId(competency_id)) { res.status(400).json({ error: 'course_id and competency_id required' }); return null; }
  const course = await getCourse(course_id);
  const comp = await schoolOfRow('competencies', competency_id);
  if (!course || !comp) { res.status(404).json({ error: 'Course or competency not found' }); return null; }
  if (!sameSchool(req.user, course.school_id) || Number(course.school_id) !== Number(comp.school_id)) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return { course, comp };
};

const link = async (req, res) => {
  try {
    const p = await pair(req, res, req.body.course_id, req.body.competency_id);
    if (!p) return;
    await m.linkToCourse(p.course.id, p.comp.id);
    res.json({ message: 'Linked' });
  } catch (err) { fail(res, err); }
};

const unlink = async (req, res) => {
  try {
    const p = await pair(req, res, req.params.course_id, req.params.competency_id);
    if (!p) return;
    await m.unlinkFromCourse(p.course.id, p.comp.id);
    res.json({ message: 'Unlinked' });
  } catch (err) { fail(res, err); }
};

const byCourse = async (req, res) => {
  try {
    const course = await getCourse(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ competencies: await m.getByCourse(course.id) });
  } catch (err) { fail(res, err); }
};

const award = async (req, res) => {
  try {
    const { student_id, competency_id, level } = req.body;
    if (!validId(student_id) || !validId(competency_id)) return res.status(400).json({ error: 'student_id and competency_id required' });
    const lv = level === undefined || level === null || level === '' ? 1 : Number(level);
    if (!Number.isInteger(lv) || lv < 0 || lv > 10) return res.status(400).json({ error: 'Level must be a whole number from 0 to 10' });
    const comp = await schoolOfRow('competencies', competency_id);
    if (!comp) return res.status(404).json({ error: 'Competency not found' });
    if (!sameSchool(req.user, comp.school_id)) return res.status(403).json({ error: 'Access denied' });
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(comp.school_id)) return res.status(404).json({ error: 'Student not found in this school' });
    res.json({ student_competency: await m.awardToStudent(st.id, comp.id, lv) });
  } catch (err) { fail(res, err); }
};

const studentCompetencies = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ competencies: await m.getStudentCompetencies(access.student.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const comp = await schoolOfRow('competencies', req.params.id);
    if (!comp) return res.status(404).json({ error: 'Competency not found' });
    if (!sameSchool(req.user, comp.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.remove(comp.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, link, unlink, byCourse, award, studentCompetencies, remove };
