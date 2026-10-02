const { markAttendance, getAttendanceByClass, getAttendanceByStudent } = require('../models/attendance.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass } = require('../utils/access');

const STAFF = ['super_admin', 'school_admin', 'teacher'];

const mark = async (req, res) => {
  try {
    const { student_id, class_id, date, status } = req.body;
    if (!validId(student_id) || !validId(class_id) || !date || !status) {
      return res.status(400).json({ error: 'student_id, class_id, date and status required' });
    }
    if (Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
    if (typeof status !== 'string' || status.length > 20) return res.status(400).json({ error: 'Invalid status' });
    const cls = await getClass(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(cls.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const record = await markAttendance({ school_id: cls.school_id, student_id: st.id, class_id: cls.id, date, status });
    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byClass = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const cls = await getClass(req.params.class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const { date } = req.query;
    const records = await getAttendanceByClass(cls.id, date);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ records: await getAttendanceByStudent(access.student.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { mark, byClass, byStudent };
