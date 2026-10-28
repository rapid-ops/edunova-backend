const adaptiveModel = require('../models/adaptive.model');
const learningTwinModel = require('../models/learningtwin.model');
const m = require('../models/quiz.model');
const { issueCertificate, getCertificate } = require('../models/certificate.model');
const { sendWhatsApp } = require('../services/whatsapp.service');
const gam = require('../models/gamification.model');
const T = require('../utils/teaching');
const A = require('../utils/assessmentaccess');
const pool = require('../config/db');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const publicQuiz = (a) => ({
  id: a.id,
  course_id: a.course_id,
  course_title: a.course_title || null,
  title: a.title,
  instructions: a.instructions,
  due_date: a.due_date,
  total_marks: a.total_marks,
  time_limit_minutes: a.time_limit_minutes,
  max_attempts: a.max_attempts || 1,
  pass_percent: a.pass_percent === null || a.pass_percent === undefined ? 50 : a.pass_percent,
  randomize_questions: !!a.randomize_questions,
  awards_certificate: !!a.awards_certificate,
  scheduled_at: a.scheduled_at || null,
  negative_marking: Number(a.negative_marking || 0),
  show_answers: !!a.show_answers,
  is_published: !!a.is_published,
  closed_at: a.closed_at || null,
  status: A.statusOf(a),
});

const intOrNull = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

const parseSettings = (b) => {
  const title = String(b.title || '').trim();
  if (!title) return { error: 'Title is required' };
  if (b.due_date && Number.isNaN(Date.parse(b.due_date))) return { error: 'Invalid due date' };
  const tl = intOrNull(b.time_limit_minutes);
  if (tl !== null && (!Number.isInteger(tl) || tl < 1 || tl > 600)) return { error: 'Time limit must be 1 to 600 minutes' };
  const maRaw = intOrNull(b.max_attempts);
  const ma = maRaw === null ? 1 : maRaw;
  if (!Number.isInteger(ma) || ma < 1 || ma > 20) return { error: 'Attempts must be 1 to 20' };
  const ppRaw = intOrNull(b.pass_percent);
  const pp = ppRaw === null ? 50 : ppRaw;
  if (!Number.isInteger(pp) || pp < 1 || pp > 100) return { error: 'Pass mark must be 1 to 100 percent' };
  if (b.scheduled_at && Number.isNaN(Date.parse(b.scheduled_at)))
    return { error: 'Invalid scheduled_at' };
  let nm = null;
  if (b.negative_marking !== undefined && b.negative_marking !== null && b.negative_marking !== '') {
    nm = Number(b.negative_marking);
    if (!Number.isFinite(nm) || nm < 0 || nm > 1) return { error: 'Marks lost for a wrong answer must be between 0 and 1 (for example 0.25 for a quarter of the marks).' };
  }
  const sa = b.show_answers === undefined || b.show_answers === null ? null : b.show_answers === true;
  return {
    title: title.slice(0, 255),
    instructions: b.instructions ? String(b.instructions).slice(0, 5000) : null,
    due_date: b.due_date || null,
    time_limit_minutes: tl,
    max_attempts: ma,
    pass_percent: pp,
    randomize_questions: b.randomize_questions === true,
    awards_certificate: b.awards_certificate === true,
    scheduled_at: b.scheduled_at || null,
    negative_marking: nm,
    show_answers: sa,
  };
};

// Loads a quiz and checks who may use it: students need enrollment and a published quiz that has opened; staff must manage the course.
const loadQuiz = async (req, res) => {
  if (!validId(req.params.assessment_id)) { res.status(404).json({ error: 'Quiz not found' }); return null; }
  const a = await m.getAssessment(req.params.assessment_id);
  if (!a) { res.status(404).json({ error: 'Quiz not found' }); return null; }
  if (req.user.role === 'student') {
    if (!sameSchool(req.user, a.course_school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
    if (!(await m.isEnrolled(req.user.id, a.course_id))) { res.status(403).json({ error: 'You are not enrolled in this course' }); return null; }
    if (!A.visibleToStudent(a)) { res.status(404).json({ error: 'This quiz is not available yet.' }); return null; }
    return a;
  }
  if (!(await A.canManage(req.user, a))) { res.status(403).json({ error: 'Access denied' }); return null; }
  return a;
};

const create = async (req, res) => {
  try {
    if (!validId(req.body.course_id)) return res.status(400).json({ error: 'Choose a course first.' });
    const s = parseSettings(req.body);
    if (s.error) return res.status(400).json({ error: s.error });
    const course = await T.getCourseFull(req.body.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!(await T.canManageCourse(req.user, course))) return res.status(403).json({ error: 'Access denied' });
    const quiz = await m.createQuiz(course.id, s);
    res.status(201).json({ quiz: publicQuiz({ ...quiz, course_title: course.title }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listByCourse = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await T.getCourseFull(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!(await T.canManageCourse(req.user, course))) return res.status(403).json({ error: 'Access denied' });
    const rows = await m.listByCourse(course.id);
    res.json({ quizzes: rows.map((r) => ({ ...r, status: A.statusOf(r) })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const myQuizzes = async (req, res) => {
  try {
    const rows = await m.listForStudent(req.user.id);
    res.json({
      quizzes: rows.map((r) => ({
        ...r,
        best_score: r.best_score === null ? null : Number(r.best_score),
        passed: !!r.passed,
        attempts_used: r.attempts_used || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const info = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    const state = await m.getAttemptState(a.id, req.user.id);
    const count = await m.countQuestions(a.id);
    const limitSec = a.time_limit_minutes ? a.time_limit_minutes * 60 : null;
    res.json({
      quiz: publicQuiz(a),
      question_count: count,
      attempt: state
        ? {
            status: state.status,
            attempts_used: state.attempt_count,
            best_score: state.score === null ? null : Number(state.score),
            passed: !!state.passed,
            seconds_left:
              state.status === 'in_progress' && limitSec !== null
                ? Math.max(0, Math.round(limitSec - state.elapsed))
                : null,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const publicOptions = (q) => {
  if (q.type === 'mcq') return q.options || [];
  if (q.type === 'matching') {
    let pairs = q.options;
    if (typeof pairs === 'string') { try { pairs = JSON.parse(pairs); } catch (e) { pairs = []; } }
    pairs = Array.isArray(pairs) ? pairs : [];
    const rights = pairs.map((p) => String(p.right));
    for (let i = rights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rights[i], rights[j]] = [rights[j], rights[i]];
    }
    return { lefts: pairs.map((p) => String(p.left)), rights };
  }
  return null;
};

const start = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    if (a.scheduled_at && new Date() < new Date(a.scheduled_at))
      return res.status(400).json({ error: 'This quiz has not started yet', scheduled_at: a.scheduled_at });
    if (A.isClosed(a)) return res.status(400).json({ error: 'This quiz is closed.' });
    const r = await m.startAttempt(a, req.user.id);
    if (r.error) return res.status(r.code || 400).json({ error: r.error });

    const all = await m.getQuestions(a.id);
    const byId = new Map(all.map((q) => [q.id, q]));
    const ordered = r.ids.map((id) => byId.get(id)).filter(Boolean);
    const seen = new Set(ordered.map((q) => q.id));
    const rest = all.filter((q) => !seen.has(q.id));
    const questions = [...ordered, ...rest].map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: publicOptions(q),
      marks: q.marks,
    }));
    res.json({
      quiz: publicQuiz(a),
      questions,
      seconds_left: r.seconds_left,
      attempt_number: r.attempt_number,
      resumed: r.resumed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const submit = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    const answers = req.body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers required' });
    }
    const r = await m.submitQuizAttempt(a, req.user.id, answers);
    if (r.error) return res.status(r.code || 400).json({ error: r.error, expired: !!r.expired });

    if (r.passed && req.user.role === 'student') {
      try { await gam.awardOnce(req.user.id, a.course_school_id, 25, 'quiz_passed', a.id); }
      catch (e) { console.error('Gamification award failed:', e.message); }
    }
    let certificate_issued = false;
    if (r.passed && a.awards_certificate) {
      try {
        const existing = await getCertificate(req.user.id, a.course_id);
        if (!existing) {
          await issueCertificate({ student_id: req.user.id, course_id: a.course_id, school_id: a.course_school_id });
        }
        certificate_issued = true;
      } catch (e) {
        console.error('Certificate issue failed:', e.message);
      }
    }
    // WhatsApp result notification
    try {
      const stRes = await pool.query('SELECT full_name, phone FROM users WHERE id=$1', [req.user.id]);
      const st = stRes.rows[0];
      if (st?.phone) {
        sendWhatsApp(st.phone,
          `📊 Result Available
Hi ${st.full_name}, your result for ${a.title} is ready. Score: ${r.score}/${a.total_marks}. Log in to Edunova to view details.`
        );
      }
    } catch(e) { console.error('WhatsApp result error:', e.message); }
    try { const aiC = require('./ai.controller'); aiC.updateLearningTwin({ body: { student_id: req.user.id, event_type: 'quiz_submitted', data: { score: r.score, passed: r.passed } }, user: req.user }, { json: () => {} }).catch(() => {}); } catch(e) {}
    learningTwinModel.analyze(req.user.id).catch(() => {});
    try { const up = await adaptiveModel.upsert({ student_id: req.user.id, course_id: a.course_id, score: r.score }); if (up) r.difficulty_level = up.difficulty_level; } catch(e) {}
    let review;
    if (a.show_answers) {
      const qs = await m.getQuestions(a.id);
      review = qs.map((q) => {
        let opts = q.options;
        if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = null; } }
        return {
          id: q.id, question: q.question, type: q.type, marks: q.marks,
          your_answer: answers[q.id] === undefined ? null : answers[q.id],
          correct_answer: q.type === 'matching' ? opts : q.correct_answer,
          correct: m.isCorrect(q, answers[q.id]),
          explanation: q.explanation || null,
        };
      });
    }
    res.json({ ...r, certificate_issued, ...(review ? { review } : {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const manage = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    res.json({ quiz: publicQuiz(a), questions: await m.getQuestions(a.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    const s = parseSettings(req.body);
    if (s.error) return res.status(400).json({ error: s.error });
    const row = await m.updateSettings(a.id, s);
    res.json({ quiz: publicQuiz({ ...row, course_title: a.course_title }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const QTYPES = ['mcq', 'true_false', 'short_answer', 'matching', 'fill_blank'];
const LOCKED = 'Students have already started this quiz, so its questions cannot be changed. Duplicate the quiz to make a new version.';

const validateQuestion = (b) => {
  const text = String(b.question || '').trim();
  if (!text) return { error: 'Write the question.' };
  const qtype = b.type || 'mcq';
  if (!QTYPES.includes(qtype)) return { error: 'Choose a valid question type.' };
  const mk = b.marks === undefined || b.marks === null || b.marks === '' ? 1 : Number(b.marks);
  if (!Number.isInteger(mk) || mk < 1 || mk > 100) return { error: 'Marks must be a whole number from 1 to 100.' };
  let answer = String(b.correct_answer === undefined || b.correct_answer === null ? '' : b.correct_answer).trim();
  let opts = null;
  if (qtype === 'mcq') {
    opts = (Array.isArray(b.options) ? b.options : []).map((o) => String(o).trim()).filter(Boolean);
    if (opts.length < 2) return { error: 'Give at least 2 options.' };
    if (opts.length > 8) return { error: 'Use at most 8 options.' };
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return { error: 'Each option must be different.' };
    const match = opts.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (!answer || !match) return { error: 'Mark which option is the correct answer.' };
    answer = match;
  } else if (qtype === 'true_false') {
    const t = answer.toLowerCase();
    if (t !== 'true' && t !== 'false') return { error: 'The correct answer must be True or False.' };
    answer = t === 'true' ? 'True' : 'False';
  } else if (qtype === 'matching') {
    let pairs = b.options;
    if (typeof pairs === 'string') { try { pairs = JSON.parse(pairs); } catch (e) { pairs = null; } }
    if (!Array.isArray(pairs) || pairs.length < 2) return { error: 'Matching needs at least 2 pairs.' };
    if (pairs.length > 8) return { error: 'Use at most 8 pairs.' };
    opts = pairs.map((p) => ({ left: String((p && p.left) || '').trim(), right: String((p && p.right) || '').trim() }));
    if (opts.some((p) => !p.left || !p.right)) return { error: 'Fill in both sides of every pair.' };
    if (new Set(opts.map((p) => p.left.toLowerCase())).size !== opts.length || new Set(opts.map((p) => p.right.toLowerCase())).size !== opts.length) {
      return { error: 'Each item and each match must be different.' };
    }
    answer = JSON.stringify(opts);
  } else {
    const list = answer.split('|').map((x) => x.trim()).filter(Boolean);
    if (!list.length) return { error: 'Give at least one accepted answer.' };
    answer = list.join('|');
  }
  const explanation = b.explanation ? String(b.explanation).trim().slice(0, 1000) : null;
  return { q: { question: text.slice(0, 2000), type: qtype, options: opts, correct_answer: answer, marks: mk, explanation } };
};

const INSERT_Q = `INSERT INTO quiz_questions (assessment_id, question, type, options, correct_answer, marks, position, explanation)
  VALUES ($1,$2,$3,$4,$5,$6,(SELECT COUNT(*) FROM quiz_questions WHERE assessment_id=$1),$7) RETURNING *`;
const qParams = (aid, q) => [aid, q.question, q.type, q.options ? JSON.stringify(q.options) : null, q.correct_answer, q.marks, q.explanation];

const hasAttempts = async (assessmentId) => {
  const r = await pool.query('SELECT 1 FROM quiz_attempts WHERE assessment_id=$1 LIMIT 1', [assessmentId]);
  return r.rowCount > 0;
};

const getQ = async (id) => {
  const r = await pool.query(
    `SELECT q.*, a.course_id, c.school_id AS course_school_id
     FROM quiz_questions q JOIN assessments a ON a.id=q.assessment_id JOIN courses c ON c.id=a.course_id
     WHERE q.id=$1`, [id]);
  return r.rows[0] || null;
};

const addQuestion = async (req, res) => {
  try {
    const { assessment_id } = req.body || {};
    if (!validId(assessment_id)) return res.status(400).json({ error: 'Choose a quiz first.' });
    const a = await m.getAssessment(assessment_id);
    if (!a) return res.status(404).json({ error: 'Quiz not found' });
    if (!(await A.canManage(req.user, a))) return res.status(403).json({ error: 'Access denied' });
    if (await hasAttempts(a.id)) return res.status(409).json({ error: LOCKED });
    const v = validateQuestion(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const total = await m.getTotalMarks(a.id);
    if (total + v.q.marks > 999) return res.status(400).json({ error: 'A quiz can have at most 999 marks in total.' });
    const r = await pool.query(INSERT_Q, qParams(a.id, v.q));
    await m.recalcTotal(a.id);
    res.status(201).json({ question: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeQuestion = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Question not found' });
    const q = await getQ(req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (!(await T.canManageCourse(req.user, { id: q.course_id, school_id: q.course_school_id }))) return res.status(403).json({ error: 'Access denied' });
    if (await hasAttempts(q.assessment_id)) return res.status(409).json({ error: LOCKED });
    await m.deleteQuestion(q.id);
    await m.recalcTotal(q.assessment_id);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Question not found' });
    const q = await getQ(req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (!(await T.canManageCourse(req.user, { id: q.course_id, school_id: q.course_school_id }))) return res.status(403).json({ error: 'Access denied' });
    if (await hasAttempts(q.assessment_id)) return res.status(409).json({ error: LOCKED });
    const v = validateQuestion(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    const total = await m.getTotalMarks(q.assessment_id);
    if (total - q.marks + v.q.marks > 999) return res.status(400).json({ error: 'A quiz can have at most 999 marks in total.' });
    const r = await pool.query(
      `UPDATE quiz_questions SET question=$2, type=$3, options=$4, correct_answer=$5, marks=$6, explanation=$7
       WHERE id=$1 RETURNING *`,
      [q.id, v.q.question, v.q.type, v.q.options ? JSON.stringify(v.q.options) : null, v.q.correct_answer, v.q.marks, v.q.explanation]);
    await m.recalcTotal(q.assessment_id);
    res.json({ question: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const reorder = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    const ids = (await m.getQuestions(a.id)).map((q) => q.id);
    const given = Array.isArray(req.body && req.body.order) ? req.body.order.map(Number) : [];
    if (given.length !== ids.length || new Set(given).size !== given.length || !given.every((id) => ids.includes(id))) {
      return res.status(400).json({ error: 'Send every question exactly once to change the order.' });
    }
    await T.inTxn(async (c) => {
      for (let i = 0; i < given.length; i++) {
        await c.query('UPDATE quiz_questions SET position=$1 WHERE id=$2 AND assessment_id=$3', [i, given[i], a.id]);
      }
    });
    res.json({ questions: await m.getQuestions(a.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const bulkAdd = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    if (await hasAttempts(a.id)) return res.status(409).json({ error: LOCKED });
    const list = req.body && req.body.questions;
    if (!Array.isArray(list) || list.length < 1 || list.length > 30) return res.status(400).json({ error: 'Send between 1 and 30 questions.' });
    const clean = [];
    for (let i = 0; i < list.length; i++) {
      const v = validateQuestion(list[i] || {});
      if (v.error) return res.status(400).json({ error: 'Question ' + (i + 1) + ': ' + v.error });
      clean.push(v.q);
    }
    const total = await m.getTotalMarks(a.id);
    if (total + clean.reduce((s, q) => s + q.marks, 0) > 999) return res.status(400).json({ error: 'A quiz can have at most 999 marks in total.' });
    const saved = await T.inTxn(async (c) => {
      const out = [];
      for (const q of clean) { const r = await c.query(INSERT_Q, qParams(a.id, q)); out.push(r.rows[0]); }
      return out;
    });
    await m.recalcTotal(a.id);
    res.status(201).json({ questions: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const attempts = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    const rows = await m.listAttempts(a.id);
    res.json({
      attempts: rows.map((r) => ({
        ...r,
        score: r.score === null ? null : Number(r.score),
        last_score: r.last_score === null ? null : Number(r.last_score),
        passed: !!r.passed,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




const attemptCount = async (req, res) => {
  try {
    const { assessment_id, student_id } = req.params;
    if (!validId(assessment_id) || !validId(student_id)) return res.status(400).json({ error: 'Invalid params' });
    const a = await m.getAssessment(assessment_id);
    if (!a) return res.status(404).json({ error: 'Quiz not found' });
    if (req.user.role === 'student') {
      if (Number(student_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Access denied' });
    } else if (!(await A.canManage(req.user, a))) return res.status(403).json({ error: 'Access denied' });
    const r = await pool.query('SELECT COUNT(*) FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2', [a.id, student_id]);
    res.json({ count: Number(r.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, listByCourse, myQuizzes, info, start, submit, manage, updateSettings, addQuestion, removeQuestion, updateQuestion, reorder, bulkAdd, attempts, attemptCount };
