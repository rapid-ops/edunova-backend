const { enrollStudentToClass, getStudentsByClass, getClassesByStudent, removeStudentFromClass } = require('../models/studentclass.model');

const enroll = async (req, res) => {
  try {
    const { student_id, class_id, school_id } = req.body;
    if (!student_id || !class_id || !school_id) return res.status(400).json({ error: 'student_id, class_id, school_id required' });
    const sc = await enrollStudentToClass({ student_id, class_id, school_id });
    res.status(201).json({ enrollment: sc });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listByClass = async (req, res) => {
  try {
    const students = await getStudentsByClass(req.params.class_id);
    res.json({ students });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listByStudent = async (req, res) => {
  try {
    const classes = await getClassesByStudent(req.params.student_id);
    res.json({ classes });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const remove = async (req, res) => {
  try {
    await removeStudentFromClass(req.params.student_id, req.params.class_id);
    res.json({ message: 'Student removed from class' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { enroll, listByClass, listByStudent, remove };
