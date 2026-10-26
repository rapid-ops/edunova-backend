const pool = require('../config/db');
const m = require('../models/classsession.model');
const { validId, sameSchool, getCourse } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });
const isAdmin = (u) => u.role === 'super_admin' || u.role === 'school_admin';
const canManage = (u, s) => isAdmin(u) || Number(s.teacher_id) === Number(u.id);

const loadSession = async (req, res, id) => {
  if (!validId(id)) { res.status(404).json({ error: 'Session not found' }); return null; }
  const s = await m.getById(id);
  if (!s) { res.status(404).json({ error: 'Session not found' }); return null; }
  if (!sameSchool(req.user, s.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return s;
};

const cleanUrl = (v) => {
  if (!v) return null;
  try { const u = new URL(String(v).trim()); return /^https?:$/.test(u.protocol) ? u.toString().slice(0, 500) : null; } catch { return null; }
};

const create = async (req, res) => {
  try {
    const { course_id, title, meeting_url } = req.body;
    if (!validId(course_id) || !title || !String(title).trim()) return res.status(400).json({ error: 'course_id and title required' });
    if (meeting_url && !cleanUrl(meeting_url)) return res.status(400).json({ error: 'meeting_url must be a valid http(s) link' });
    const course = await getCourse(course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    const s = await m.create({
      school_id: course.school_id, teacher_id: req.user.id, course_id: course.id,
      title: String(title).trim().slice(0, 255), meeting_url: cleanUrl(meeting_url),
    });
    res.status(201).json({ session: s });
  } catch (err) { fail(res, err); }
};

const join = async (req, res) => {
  try {
    const s = await m.getByCode(String(req.params.code || ''));
    if (!s || !sameSchool(req.user, s.school_id)) return res.status(404).json({ error: 'Invalid or expired code' });
    res.json({ session: s });
  } catch (err) { fail(res, err); }
};

const byTeacher = async (req, res) => {
  try {
    const tid = req.params.teacher_id;
    if (!validId(tid)) return res.status(404).json({ error: 'Not found' });
    if (Number(tid) !== Number(req.user.id)) {
      if (!isAdmin(req.user)) return res.status(403).json({ error: 'Access denied' });
      const t = await pool.query('SELECT school_id FROM users WHERE id=$1', [tid]);
      if (!t.rows[0] || !sameSchool(req.user, t.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ sessions: await m.getByTeacher(tid) });
  } catch (err) { fail(res, err); }
};

const close = async (req, res) => {
  try {
    const s = await loadSession(req, res, req.params.id);
    if (!s) return;
    if (!canManage(req.user, s)) return res.status(403).json({ error: 'Access denied' });
    await m.close(s.id);
    res.json({ message: 'Session closed' });
  } catch (err) { fail(res, err); }
};

const ask = async (req, res) => {
  try {
    const { session_id, question, is_anonymous } = req.body;
    const text = typeof question === 'string' ? question.trim().slice(0, 1000) : '';
    if (!validId(session_id) || !text) return res.status(400).json({ error: 'session_id and question required' });
    const s = await loadSession(req, res, session_id);
    if (!s) return;
    if (!s.is_active) return res.status(400).json({ error: 'Session is closed' });
    const q = await m.askQuestion({ session_id: s.id, student_id: req.user.id, question: text, is_anonymous: !!is_anonymous });
    res.status(201).json({ question: q });
  } catch (err) { fail(res, err); }
};

const questions = async (req, res) => {
  try {
    const s = await loadSession(req, res, req.params.session_id);
    if (!s) return;
    const qs = (await m.getQuestions(s.id)).map((q) => (q.is_anonymous && !canManage(req.user, s) ? { ...q, student_id: null } : q));
    res.json({ questions: qs });
  } catch (err) { fail(res, err); }
};

const loadQuestionSession = async (req, res) => {
  if (!validId(req.params.id)) { res.status(404).json({ error: 'Question not found' }); return null; }
  const r = await pool.query('SELECT session_id FROM session_questions WHERE id=$1', [req.params.id]);
  if (!r.rows[0]) { res.status(404).json({ error: 'Question not found' }); return null; }
  return loadSession(req, res, r.rows[0].session_id);
};

const teacherAnswer = async (req, res) => {
  try {
    const answer = typeof req.body.answer === 'string' ? req.body.answer.trim().slice(0, 2000) : '';
    if (!answer) return res.status(400).json({ error: 'answer required' });
    const s = await loadQuestionSession(req, res);
    if (!s) return;
    if (!canManage(req.user, s)) return res.status(403).json({ error: 'Access denied' });
    res.json({ question: await m.teacherAnswer(req.params.id, answer) });
  } catch (err) { fail(res, err); }
};

const adminAnswer = async (req, res) => {
  try {
    const answer = typeof req.body.answer === 'string' ? req.body.answer.trim().slice(0, 2000) : '';
    if (!answer) return res.status(400).json({ error: 'answer required' });
    const s = await loadQuestionSession(req, res);
    if (!s) return;
    res.json({ question: await m.adminAnswer(req.params.id, answer) });
  } catch (err) { fail(res, err); }
};

const myCourses = async (req, res) => {
  try {
    const u = req.user;
    let r;
    if (u.role === 'teacher') {
      r = await pool.query(
        `SELECT id, title FROM courses WHERE school_id=$1 AND (teacher_id=$2
           OR id IN (SELECT course_id FROM course_assignments WHERE teacher_id=$2)) ORDER BY title`, [u.school_id, u.id]);
    } else {
      const sid = u.role === 'super_admin' ? req.query.school_id : u.school_id;
      if (!validId(sid)) return res.json({ courses: [] });
      r = await pool.query(`SELECT id, title FROM courses WHERE school_id=$1 ORDER BY title`, [sid]);
    }
    res.json({ courses: r.rows });
  } catch (err) { fail(res, err); }
};

module.exports = { create, join, byTeacher, close, ask, questions, teacherAnswer, adminAnswer, myCourses };
