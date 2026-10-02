const { enrollStudentToClass, getStudentsByClass, getClassesByStudent, removeStudentFromClass } = require('../models/studentclass.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });

const loadClass = async (req, res, id) => {
  const cls = await getClass(id);
  if (!cls) { res.status(404).json({ error: 'Class not found' }); return null; }
  if (!sameSchool(req.user, cls.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return cls;
};

const enroll = async (req, res) => {
  try {
    const { student_id, class_id } = req.body;
    if (!validId(student_id) || !validId(class_id)) return res.status(400).json({ error: 'student_id and class_id required' });
    const cls = await loadClass(req, res, class_id);
    if (!cls) return;
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(cls.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const sc = await enrollStudentToClass({ student_id: st.id, class_id: cls.id, school_id: cls.school_id });
    res.status(201).json({ enrollment: sc });
  } catch (err) { fail(res, err); }
};

const listByClass = async (req, res) => {
  try {
    const cls = await loadClass(req, res, req.params.class_id);
    if (!cls) return;
    res.json({ students: await getStudentsByClass(cls.id) });
  } catch (err) { fail(res, err); }
};

const listByStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ classes: await getClassesByStudent(access.student.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    if (!validId(req.params.student_id)) return res.status(404).json({ error: 'Student not found' });
    const cls = await loadClass(req, res, req.params.class_id);
    if (!cls) return;
    await removeStudentFromClass(req.params.student_id, cls.id);
    res.json({ message: 'Student removed from class' });
  } catch (err) { fail(res, err); }
};

module.exports = { enroll, listByClass, listByStudent, remove };
