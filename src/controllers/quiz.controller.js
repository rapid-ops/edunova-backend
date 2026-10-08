const adaptiveModel = require('../models/adaptive.model');
const learningTwinModel = require('../models/learningtwin.model');
const m = require('../models/quiz.model');
const { issueCertificate, getCertificate } = require('../models/certificate.model');
const { sendWhatsApp } = require('../services/whatsapp.service');
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
  };
};

// Loads a quiz and enforces school scope (and enrollment for students).
const loadQuiz = async (req, res) => {
  if (!validId(req.params.assessment_id)) { res.status(404).json({ error: 'Quiz not found' }); return null; }
  const a = await m.getAssessment(req.params.assessment_id);
  if (!a) { res.status(404).json({ error: 'Quiz not found' }); return null; }
  if (!sameSchool(req.user, a.course_school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  if (req.user.role === 'student' && !(await m.isEnrolled(req.user.id, a.course_id))) {
    res.status(403).json({ error: 'You are not enrolled in this course' });
    return null;
  }
  return a;
};

const create = async (req, res) => {
  try {
    if (!validId(req.body.course_id)) return res.status(400).json({ error: 'course_id required' });
    const s = parseSettings(req.body);
    if (s.error) return res.status(400).json({ error: s.error });
    const course = await m.getCourseSchool(req.body.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const quiz = await m.createQuiz(Number(req.body.course_id), s);
    res.status(201).json({ quiz: publicQuiz(quiz) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listByCourse = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const course = await m.getCourseSchool(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ quizzes: await m.listByCourse(req.params.course_id) });
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

const start = async (req, res) => {
  try {
    const a = await loadQuiz(req, res);
    if (!a) return;
    if (a.scheduled_at && new Date() < new Date(a.scheduled_at))
      return res.status(400).json({ error: 'This quiz has not started yet', scheduled_at: a.scheduled_at });
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
      options: q.type === 'mcq' ? q.options || [] : null,
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
    res.json({ ...r, certificate_issued });
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

const addQuestion = async (req, res) => {
  try {
    const { assessment_id, question, type, options, correct_answer, marks } = req.body;
    if (!validId(assessment_id)) return res.status(400).json({ error: 'assessment_id required' });
    const a = await m.getAssessment(assessment_id);
    if (!a) return res.status(404).json({ error: 'Quiz not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });

    const text = String(question || '').trim();
    if (!text) return res.status(400).json({ error: 'Question text required' });
    const qtype = type || 'mcq';
    if (!['mcq', 'true_false', 'short_answer', 'matching', 'fill_blank'].includes(qtype))
      return res.status(400).json({ error: 'Invalid question type' });
    const mk = marks === undefined || marks === null || marks === '' ? 1 : Number(marks);
    if (!Number.isInteger(mk) || mk < 1 || mk > 100) return res.status(400).json({ error: 'Marks must be 1 to 100' });

    let answer = String(correct_answer === undefined || correct_answer === null ? '' : correct_answer).trim();
    if (!answer) return res.status(400).json({ error: 'Correct answer required' });
    let opts = null;
    if (qtype === 'mcq') {
      opts = (Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean);
      if (opts.length < 2) return res.status(400).json({ error: 'Give at least 2 options' });
      const match = opts.find((o) => o.toLowerCase() === answer.toLowerCase());
      if (!match) return res.status(400).json({ error: 'The correct answer must match one of the options' });
      answer = match;
    } else if (qtype === 'true_false') {
      const t = answer.toLowerCase();
      if (t !== 'true' && t !== 'false') return res.status(400).json({ error: 'Correct answer must be True or False' });
      answer = t === 'true' ? 'True' : 'False';
    } else if (qtype === 'matching') {
      let pairs;
      try { pairs = typeof options === 'string' ? JSON.parse(options) : options; } catch { pairs = null; }
      if (!Array.isArray(pairs) || pairs.length < 2)
        return res.status(400).json({ error: 'matching requires at least 2 {left,right} pairs in options' });
      if (!pairs.every(p => p && typeof p.left === 'string' && typeof p.right === 'string'))
        return res.status(400).json({ error: 'Each matching option must have left and right strings' });
      opts = pairs;
      answer = JSON.stringify(pairs);
    } else if (qtype === 'fill_blank') {
      if (!answer) return res.status(400).json({ error: 'correct_answer required (pipe-separated acceptable answers)' });
    }

    const total = await m.getTotalMarks(a.id);
    if (total + mk > 999) return res.status(400).json({ error: 'A quiz can have at most 999 marks in total' });

    const q = await m.addQuestion({
      assessment_id: a.id,
      question: text.slice(0, 2000),
      type: qtype,
      options: opts,
      correct_answer: answer,
      marks: mk,
    });
    await m.recalcTotal(a.id);
    res.status(201).json({ question: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeQuestion = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Question not found' });
    const q = await m.getQuestionWithSchool(req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    if (!sameSchool(req.user, q.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.deleteQuestion(q.id);
    await m.recalcTotal(q.assessment_id);
    res.json({ message: 'Question deleted' });
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
    if (!req.params.assessment_id || !req.params.student_id) {
      return res.status(400).json({ error: 'Invalid params' });
    }
    const pool = require('../config/db');
    const r = await pool.query(
      'SELECT COUNT(*) FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2',
      [req.params.assessment_id, req.params.student_id]
    );
    res.json({ count: Number(r.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, listByCourse, myQuizzes, info, start, submit, manage, updateSettings, addQuestion, removeQuestion, attempts, attemptCount };
