const pool = require('../config/db');
const m = require('../models/submission.model');
const gb = require('../models/gradebook.model');
const T = require('../utils/teaching');
const A = require('../utils/assessmentaccess');

const { validId } = T;
const deny = (res) => res.status(403).json({ error: 'Access denied' });
const fail = (res, err) => {
  console.error('submission error:', err.message);
res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const schoolMatch = (user, schoolId) => user.role === 'super_admin' || (user.school_id != null && Number(user.school_id) === Number(schoolId));
const hide = (s) => ({ ...s, score: null, feedback: null, status: 'submitted', graded_by: null, graded_at: null });

const submit = async (req, res) => {
  try {
    const { assessment_id, file_url, text_answer } = req.body || {};
    if (!validId(assessment_id)) return res.status(400).json({ error: 'Choose what you are submitting to.' });
    const a = await A.load(assessment_id);
    if (!a || a.type === 'quiz') return res.status(404).json({ error: 'Assessment not found' });
    if (!schoolMatch(req.user, a.course_school_id)) return deny(res);
    if (!(await A.isEnrolled(req.user.id, a.course_id))) return res.status(403).json({ error: 'You are not enrolled in this course.' });
    if (!A.visibleToStudent(a)) return res.status(404).json({ error: 'Assessment not found' });
    if (a.closed_at && new Date(a.closed_at) <= new Date()) return res.status(400).json({ error: 'This has been closed and is no longer taking work.' });
    if (!a.allow_late && a.due_date && new Date() > new Date(a.due_date)) return res.status(400).json({ error: 'The deadline has passed.' });
    if (await m.getByStudent(a.id, req.user.id)) return res.status(409).json({ error: 'You have already submitted this.' });
    const link = file_url ? String(file_url).trim() : '';
    if (!link && !(text_answer && String(text_answer).trim())) return res.status(400).json({ error: 'Write an answer or add a link to your work.' });
    if (link && !/^https?:\/\/\S+$/i.test(link)) return res.status(400).json({ error: 'The link must start with http or https.' });
    const submission = await m.create({
      assessment_id: a.id,
      student_id: req.user.id,
      file_url: link ? link.slice(0, 1000) : null,
      text_answer: text_answer ? String(text_answer).slice(0, 20000) : null,
    });
    res.status(201).json({ submission });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.assessment_id)) return res.status(404).json({ error: 'Assessment not found' });
    const a = await A.load(req.params.assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!(await A.canManage(req.user, a))) return deny(res);
    res.json({ submissions: await m.getByAssessment(a.id) });
  } catch (err) { fail(res, err); }
};

const getOwn = async (req, res) => {
  try {
    if (!validId(req.params.assessment_id)) return res.status(404).json({ error: 'Assessment not found' });
    const a = await A.load(req.params.assessment_id);
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!schoolMatch(req.user, a.course_school_id)) return deny(res);
    const s = await m.getByStudent(a.id, req.user.id);
    if (!s) return res.status(404).json({ error: 'No submission found' });
    const shown = s.status === 'graded' && !a.results_released ? hide(s) : s;
    res.json({ submission: shown, results_released: !!a.results_released });
  } catch (err) { fail(res, err); }
};

const gradeSubmission = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Submission not found' });
    const sr = await pool.query(
      `SELECT s.*, a.course_id, a.total_marks, a.title AS assessment_title, c.school_id AS course_school_id
       FROM submissions s
       JOIN assessments a ON a.id=s.assessment_id
       JOIN courses c ON c.id=a.course_id
       WHERE s.id=$1`, [req.params.id]);
    const sub = sr.rows[0];
    if (!sub) return res.status(404).json({ error: 'Submission not found' });
    if (!(await T.canManageCourse(req.user, { id: sub.course_id, school_id: sub.course_school_id }))) return deny(res);
    const { score, feedback } = req.body || {};
    const sc = Number(score);
    const max = Number(sub.total_marks) || 100;
    if (score === undefined || score === null || score === '' || !Number.isFinite(sc) || sc < 0 || sc > max) {
      return res.status(400).json({ error: 'The score must be from 0 to ' + max + '.' });
    }
    const submission = await m.grade({
      id: sub.id, score: sc, feedback: feedback ? String(feedback).slice(0, 20000) : null, graded_by: req.user.id,
    });
    try {
      await gb.upsert({
        school_id: sub.course_school_id, student_id: sub.student_id,
        course_id: sub.course_id, assessment_id: sub.assessment_id,
        score: (sc / max) * 100, weight: 1,
      });
    } catch (e) { console.error('Gradebook upsert failed:', e.message); }
    res.json({ submission });
  } catch (err) { fail(res, err); }
};

module.exports = { submit, list, getOwn, gradeSubmission };
