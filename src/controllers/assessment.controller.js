const pool = require('../config/db');
const m = require('../models/assessment.model');
const T = require('../utils/teaching');
const A = require('../utils/assessmentaccess');

const { validId } = T;
const TYPES = ['quiz', 'assignment', 'exam'];
const deny = (res) => res.status(403).json({ error: 'Access denied' });
const notFound = (res) => res.status(404).json({ error: 'Assessment not found' });
const fail = (res, err) => {
  console.error('assessment error:', err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
};
const withStatus = (a) => { const { course_school_id, ...rest } = a; return { ...rest, status: A.statusOf(a) }; };

const cleanRubric = (rubric, marks) => {
  if (rubric === null || (Array.isArray(rubric) && rubric.length === 0)) return { value: null };
  if (!Array.isArray(rubric) || rubric.length > 20) return { error: 'The rubric is not valid.' };
  const out = [];
  for (const r of rubric) {
    const name = String((r && r.criterion) || '').trim();
    const mx = Number(r && r.max_score);
    if (!name || !Number.isFinite(mx) || mx <= 0) return { error: 'Each rubric line needs a name and a score above 0.' };
    out.push({ criterion: name.slice(0, 120), max_score: mx });
  }
  if (new Set(out.map((r) => r.criterion.toLowerCase())).size !== out.length) return { error: 'Rubric lines must have different names.' };
  if (Math.abs(out.reduce((s, r) => s + r.max_score, 0) - marks) > 0.000001) return { error: 'The rubric scores must add up to the total marks.' };
  return { value: out };
};

const parse = (b, existing) => {
  const out = {};
  if (b.title !== undefined || !existing) {
    const t = String(b.title || '').trim();
    if (!t) return { error: 'Give it a title.' };
    out.title = t.slice(0, 255);
  }
  if (b.instructions !== undefined) out.instructions = b.instructions ? String(b.instructions).slice(0, 5000) : null;
  if (b.due_date !== undefined) {
    if (b.due_date && Number.isNaN(Date.parse(b.due_date))) return { error: 'That due date is not valid.' };
    out.due_date = b.due_date || null;
  }
  if (b.scheduled_at !== undefined) {
    if (b.scheduled_at && Number.isNaN(Date.parse(b.scheduled_at))) return { error: 'That opening date is not valid.' };
    out.scheduled_at = b.scheduled_at || null;
  }
  if (b.allow_late !== undefined) {
    if (typeof b.allow_late !== 'boolean') return { error: 'Late work must be switched on or off.' };
    out.allow_late = b.allow_late;
  }
  if (b.attachment_url !== undefined) {
    const u = b.attachment_url ? String(b.attachment_url).trim() : '';
    if (u && !/^https?:\/\/\S+$/i.test(u)) return { error: 'The attachment must be a web link starting with http or https.' };
    out.attachment_url = u ? u.slice(0, 1000) : null;
  }
  let marks = existing ? Number(existing.total_marks) : 100;
  if (b.total_marks !== undefined && b.total_marks !== null && b.total_marks !== '') {
    const mk = Number(b.total_marks);
    if (!Number.isFinite(mk) || mk <= 0 || mk > 1000) return { error: 'Total marks must be between 1 and 1000.' };
    out.total_marks = mk; marks = mk;
  }
  if (b.rubric !== undefined) {
    const r = cleanRubric(b.rubric, marks);
    if (r.error) return r;
    out.rubric = r.value;
  } else if (out.total_marks !== undefined && existing && Array.isArray(existing.rubric) && existing.rubric.length) {
    return { error: 'Update the rubric when you change the total marks.' };
  }
  return { fields: out };
};

const getManaged = async (req, res) => {
  if (!validId(req.params.id)) { notFound(res); return null; }
  const a = await A.load(req.params.id);
  if (!a) { notFound(res); return null; }
  if (!(await A.canManage(req.user, a))) { deny(res); return null; }
  return a;
};

const create = async (req, res) => {
  try {
    const { course_id, type } = req.body || {};
    if (!validId(course_id) || !TYPES.includes(type)) return res.status(400).json({ error: 'Choose a course and what you are creating.' });
    const p = parse(req.body, null);
    if (p.error) return res.status(400).json({ error: p.error });
    const course = await T.getCourseFull(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!(await T.canManageCourse(req.user, course))) return deny(res);
    const assessment = await m.createAssessment({ course_id: course.id, type, ...p.fields, total_marks: p.fields.total_marks ?? 100 });
    res.status(201).json({ assessment: { ...assessment, status: A.statusOf(assessment) } });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await T.getCourseFull(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    const student = req.user.role === 'student';
    if (student) {
      if (Number(req.user.school_id) !== Number(course.school_id) || !(await A.isEnrolled(req.user.id, course.id))) return deny(res);
    } else if (!(await T.canManageCourse(req.user, course))) return deny(res);
    const rows = await m.getAssessmentsByCourse(course.id, student);
    res.json({ assessments: rows.map((a) => ({ ...a, status: A.statusOf(a) })) });
  } catch (err) { fail(res, err); }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.id)) return notFound(res);
    const a = await A.load(req.params.id);
    if (!a) return notFound(res);
    if (req.user.role === 'student') {
      if (Number(req.user.school_id) !== Number(a.course_school_id) || !(await A.isEnrolled(req.user.id, a.course_id)) || !A.visibleToStudent(a)) return notFound(res);
    } else if (!(await A.canManage(req.user, a))) return deny(res);
    res.json({ assessment: withStatus(a) });
  } catch (err) { fail(res, err); }
};

const update = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    if (a.type === 'quiz') return res.status(400).json({ error: 'Change quiz settings in the quiz editor.' });
    const p = parse(req.body || {}, a);
    if (p.error) return res.status(400).json({ error: p.error });
    if (!Object.keys(p.fields).length) return res.status(400).json({ error: 'There is nothing to change.' });
    if (p.fields.total_marks !== undefined && Number(p.fields.total_marks) !== Number(a.total_marks) && (await A.hasWork(a.id))) {
      return res.status(409).json({ error: 'Students have already submitted work, so the total marks cannot change.' });
    }
    const row = await m.updateAssessment(a.id, p.fields);
    res.json({ assessment: withStatus({ ...a, ...row }) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    if (await A.hasWork(a.id)) {
      return res.status(409).json({ error: 'Students have already worked on this, so it cannot be deleted. Close it instead: that stops new work and keeps the results.' });
    }
    await m.deleteAssessment(a.id);
    res.json({ message: 'Assessment deleted' });
  } catch (err) { fail(res, err); }
};

const publish = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    if (a.is_published) return res.json({ assessment: withStatus(a), notified: 0 });
    if (a.type === 'quiz') {
      const n = await pool.query('SELECT COUNT(*)::int AS n FROM quiz_questions WHERE assessment_id=$1', [a.id]);
      if (!n.rows[0].n) return res.status(400).json({ error: 'Add at least one question before publishing this quiz.' });
    }
    const row = await m.updateAssessment(a.id, { is_published: true, closed_at: null });
    let notified = 0;
    try {
      const ids = await A.enrolledIds(a.course_id);
      const title = 'New ' + a.type + ': ' + a.title + (a.due_date ? ', due ' + A.fmtDate(a.due_date) : '');
      notified = await A.notifyUsers(a.course_school_id, ids, title, a.course_title, req.app.get('io'));
    } catch (e) { console.error('notify failed:', e.message); }
    res.json({ assessment: withStatus({ ...a, ...row }), notified });
  } catch (err) { fail(res, err); }
};

const unpublish = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    if (await A.hasWork(a.id)) return res.status(409).json({ error: 'Students have already worked on this, so it cannot go back to a draft. Close it instead.' });
    const row = await m.updateAssessment(a.id, { is_published: false });
    res.json({ assessment: withStatus({ ...a, ...row }) });
  } catch (err) { fail(res, err); }
};

const close = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    const row = await m.updateAssessment(a.id, { closed_at: new Date().toISOString() });
    res.json({ assessment: withStatus({ ...a, ...row }) });
  } catch (err) { fail(res, err); }
};

const reopen = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    const row = await m.updateAssessment(a.id, { closed_at: null });
    res.json({ assessment: withStatus({ ...a, ...row }) });
  } catch (err) { fail(res, err); }
};

const release = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    if (a.type === 'quiz') return res.status(400).json({ error: 'Quiz scores are shown to students as soon as they finish.' });
    const on = !(req.body && req.body.released === false);
    const row = await m.updateAssessment(a.id, { results_released: on });
    let notified = 0;
    if (on && !a.results_released) {
      try {
        const g = await pool.query("SELECT DISTINCT student_id FROM submissions WHERE assessment_id=$1 AND status='graded'", [a.id]);
        notified = await A.notifyUsers(a.course_school_id, g.rows.map((x) => x.student_id),
          'Results ready: ' + a.title, 'Your result for ' + a.title + ' in ' + a.course_title + ' is ready to view.', req.app.get('io'));
      } catch (e) { console.error('notify failed:', e.message); }
    }
    res.json({ assessment: withStatus({ ...a, ...row }), notified });
  } catch (err) { fail(res, err); }
};

const duplicate = async (req, res) => {
  try {
    const a = await getManaged(req, res); if (!a) return;
    const copy = await T.inTxn(async (c) => {
      const r = await c.query(
        `INSERT INTO assessments (course_id, title, type, instructions, total_marks, allow_late, attachment_url, rubric,
           time_limit_minutes, max_attempts, pass_percent, randomize_questions, negative_marking, show_answers,
           awards_certificate, is_proctored, is_published, results_released)
         SELECT course_id, LEFT(title || ' (copy)', 255), type, instructions, total_marks, allow_late, attachment_url, rubric,
           time_limit_minutes, max_attempts, pass_percent, randomize_questions, negative_marking, show_answers,
           awards_certificate, is_proctored, false, false
         FROM assessments WHERE id=$1 RETURNING *`, [a.id]);
      await c.query(
        `INSERT INTO quiz_questions (assessment_id, question, type, options, correct_answer, marks, position, explanation)
         SELECT $2::int, question, type, options, correct_answer, marks, position, explanation
         FROM quiz_questions WHERE assessment_id=$1 ORDER BY position, id`, [a.id, r.rows[0].id]);
      return r.rows[0];
    });
    res.status(201).json({ assessment: { ...copy, status: A.statusOf(copy) } });
  } catch (err) { fail(res, err); }
};

const my = async (req, res) => {
  try {
    res.json({ assessments: await m.getMyAssessments(req.user.id) });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, get, update, remove, publish, unpublish, close, reopen, release, duplicate, my };
