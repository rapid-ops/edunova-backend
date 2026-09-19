const { markAttendance, getAttendanceByClass, getAttendanceByStudent } = require('../models/attendance.model');

const mark = async (req, res) => {
  try {
    const { school_id, student_id, class_id, date, status } = req.body;
    if (!school_id || !student_id || !class_id || !date || !status) {
      return res.status(400).json({ error: 'All fields required' });
    }
    const record = await markAttendance({ school_id, student_id, class_id, date, status });
    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byClass = async (req, res) => {
  try {
    const { date } = req.query;
    const records = await getAttendanceByClass(req.params.class_id, date);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const records = await getAttendanceByStudent(req.params.student_id);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { mark, byClass, byStudent };
