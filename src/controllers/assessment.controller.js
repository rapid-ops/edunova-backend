const pool = require('../config/db');
const { createAssessment, getAssessmentsByCourse, deleteAssessment, getMyAssessments } = require('../models/assessment.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));
const TYPES = ['quiz', 'assignment', 'exam'];

const courseSchool = async (course_id) => {
  const r = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [course_id]);
  return r.rows[0] || null;
};

const loadWithSchool = async (id) => {
  const r = await pool.query(
    `SELECT a.*, c.school_id AS course_school_id
     FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

const create = async (req, res) => {
  try {
    const { course_id, title, type, due_date, total_marks, rubric } = req.body;
    if (!validId(course_id) || !title || !String(title).trim() || !TYPES.includes(type)) {
      return res.status(400).json({ error: 'course_id, title and a valid type required' });
    }
    if (due_date && Number.isNaN(Date.parse(due_date))) return res.status(400).json({ error: 'Invalid due date' });
    const marks = (total_marks === undefined || total_marks === null || total_marks === '') ? 100 : Number(total_marks);
    if (!Number.isFinite(marks) || marks <= 0 || marks > 1000) {
      return res.status(400).json({ error: 'Total marks must be between 1 and 1000' });
    }
    const course = await courseSchool(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const assessment = await createAssessment({
      course_id: Number(course_id),
      title: String(title).trim().slice(0, 255),
      type,
      due_date: due_date || null,
      total_marks: marks,
      rubric: Array.isArray(rubric) ? rubric : null,
    });
    res.status(201).json({ assessment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await courseSchool(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const assessments = await getAssessmentsByCourse(req.params.course_id);
    res.json({ assessments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Assessment not found' });
    const a = await loadWithSchool(req.params.id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    const { course_school_id, ...assessment } = a;
    res.json({ assessment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Assessment not found' });
    const a = await loadWithSchool(req.params.id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    await deleteAssessment(a.id);
    res.json({ message: 'Assessment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


const my = async (req, res) => {
  try {
    const assessments = await getMyAssessments(req.user.id);
    res.json({ assessments });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
module.exports = { create, list, get, remove, my };
