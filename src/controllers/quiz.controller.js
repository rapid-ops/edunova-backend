const { addQuestion, getQuestions, deleteQuestion, submitAttempt, getAttempt, getAllAttempts } = require('../models/quiz.model');

const createQuestion = async (req, res) => {
  try {
    const { assessment_id, question, type, options, correct_answer, marks, position } = req.body;
    if (!assessment_id || !question) return res.status(400).json({ error: 'assessment_id and question required' });
    const q = await addQuestion({ assessment_id, question, type: type || 'mcq', options, correct_answer, marks, position });
    res.status(201).json({ question: q });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listQuestions = async (req, res) => {
  try {
    const questions = await getQuestions(req.params.assessment_id);
    res.json({ questions });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const removeQuestion = async (req, res) => {
  try {
    await deleteQuestion(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const submit = async (req, res) => {
  try {
    const { assessment_id, student_id, answers } = req.body;
    if (!assessment_id || !student_id || !answers) return res.status(400).json({ error: 'assessment_id, student_id, answers required' });
    const questions = await getQuestions(assessment_id);
    let score = 0;
    questions.forEach(q => {
      const submitted = answers[q.id];
      if (submitted && submitted.toString().toLowerCase() === q.correct_answer?.toString().toLowerCase()) {
        score += q.marks;
      }
    });
    const attempt = await submitAttempt({ assessment_id, student_id, answers, score });
    res.json({ attempt, score });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getStudentAttempt = async (req, res) => {
  try {
    const attempt = await getAttempt(req.params.assessment_id, req.params.student_id);
    res.json({ attempt });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listAttempts = async (req, res) => {
  try {
    const attempts = await getAllAttempts(req.params.assessment_id);
    res.json({ attempts });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { createQuestion, listQuestions, removeQuestion, submit, getStudentAttempt, listAttempts };
