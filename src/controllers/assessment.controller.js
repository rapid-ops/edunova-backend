const { createAssessment, getAssessmentsByCourse, getAssessmentById, deleteAssessment } = require('../models/assessment.model');

const create = async (req, res) => {
  try {
    const { course_id, title, type, due_date, total_marks } = req.body;
    if (!course_id || !title || !type) return res.status(400).json({ error: 'course_id, title and type required' });
    const assessment = await createAssessment({ course_id, title, type, due_date, total_marks: total_marks || 100 });
    res.status(201).json({ assessment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    const assessments = await getAssessmentsByCourse(req.params.course_id);
    res.json({ assessments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    const assessment = await getAssessmentById(req.params.id);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    res.json({ assessment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await deleteAssessment(req.params.id);
    res.json({ message: 'Assessment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, remove };
