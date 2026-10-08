const pool = require('../config/db');
const m = require('../models/submission.model');
const gb = require('../models/gradebook.model');
const { validId, sameSchool } = require('../utils/access');
const { sendEmail } = require('../services/email.service');

const loadA = async (id) => {
  const r = await pool.query(
    `SELECT a.*, c.school_id AS course_school_id
     FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

const submit = async (req, res) => {
  try {
    const { assessment_id, file_url, text_answer } = req.body;
    if (!validId(assessment_id))
      return res.status(400).json({ error: 'assessment_id required' });
    const a = await loadA(assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id))
      return res.status(403).json({ error: 'Access denied' });
    if (!a.allow_late && a.due_date && new Date() > new Date(a.due_date))
      return res.status(400).json({ error: 'Submission deadline has passed' });
    const existing = await m.getByStudent(assessment_id, req.user.id);
    if (existing) return res.status(409).json({ error: 'Already submitted' });
    if (!file_url && !text_answer)
      return res.status(400).json({ error: 'file_url or text_answer required' });
    const submission = await m.create({
      assessment_id: Number(assessment_id),
      student_id: req.user.id,
      file_url: file_url || null,
      text_answer: text_answer || null,
    });
    res.status(201).json({ submission });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const list = async (req, res) => {
  try {
    const { assessment_id } = req.params;
    if (!validId(assessment_id))
      return res.status(400).json({ error: 'assessment_id required' });
    const a = await loadA(assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id))
      return res.status(403).json({ error: 'Access denied' });
    res.json({ submissions: await m.getByAssessment(assessment_id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getOwn = async (req, res) => {
  try {
    const { assessment_id } = req.params;
    if (!validId(assessment_id))
      return res.status(400).json({ error: 'assessment_id required' });
    const a = await loadA(assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id))
      return res.status(403).json({ error: 'Access denied' });
    const submission = await m.getByStudent(assessment_id, req.user.id);
    if (!submission) return res.status(404).json({ error: 'No submission found' });
    res.json({ submission });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const gradeSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) return res.status(404).json({ error: 'Submission not found' });
    const sr = await pool.query(
      `SELECT s.*, a.course_id, a.total_marks, a.title AS assessment_title,
              c.school_id AS course_school_id
       FROM submissions s
       JOIN assessments a ON a.id=s.assessment_id
       JOIN courses c ON c.id=a.course_id
       WHERE s.id=$1`, [id]
    );
    const sub = sr.rows[0];
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (!sameSchool(req.user, sub.course_school_id))
      return res.status(403).json({ error: 'Access denied' });
    const { score, feedback } = req.body;
    const sc = Number(score);
    const max = sub.total_marks || 100;
    if (score === undefined || score === null || score === '' ||
        !Number.isFinite(sc) || sc < 0 || sc > max)
      return res.status(400).json({ error: `Score must be 0 to ${max}` });
    const submission = await m.grade({
      id: sub.id, score: sc, feedback: feedback || null, graded_by: req.user.id,
    });
    try {
      await gb.upsert({
        school_id: sub.course_school_id, student_id: sub.student_id,
        course_id: sub.course_id, assessment_id: sub.assessment_id,
        score: (sc / max) * 100, weight: 1,
      });
    } catch (e) { console.error('Gradebook upsert failed:', e.message); }
    try {
      const ur = await pool.query(`SELECT full_name, email FROM users WHERE id=$1`, [sub.student_id]);
      const schr = await pool.query(`SELECT name FROM schools WHERE id=$1`, [sub.course_school_id]);
      const st = ur.rows[0];
      if (st?.email) {
        await sendEmail(st.email, 'result', {
          student_name: st.full_name, assessment_title: sub.assessment_title,
          score: sc, total: max, school_name: schr.rows[0]?.name || 'Edunova',
        });
      }
    } catch (e) { console.error('Email error:', e.message); }
    res.json({ submission });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { submit, list, getOwn, gradeSubmission };
