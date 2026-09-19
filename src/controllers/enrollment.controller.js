const { enroll, getEnrollmentsByStudent, getEnrollmentsByCourse, unenroll } = require('../models/enrollment.model');

const create = async (req, res) => {
  try {
    const { student_id, course_id } = req.body;
    if (!student_id || !course_id) return res.status(400).json({ error: 'student_id and course_id required' });
    const enrollment = await enroll({ student_id, course_id });
    res.status(201).json({ enrollment });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Student already enrolled' });
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const enrollments = await getEnrollmentsByStudent(req.params.student_id);
    res.json({ enrollments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byCourse = async (req, res) => {
  try {
    const enrollments = await getEnrollmentsByCourse(req.params.course_id);
    res.json({ enrollments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { student_id, course_id } = req.body;
    await unenroll({ student_id, course_id });
    res.json({ message: 'Unenrolled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, byStudent, byCourse, remove };
