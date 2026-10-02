const { enroll, getEnrollmentsByStudent, getEnrollmentsByCourse, unenroll } = require('../models/enrollment.model');
const { validId, sameSchool, canSeeStudent, getUser, getCourse } = require('../utils/access');

const STAFF = ['super_admin', 'school_admin', 'teacher'];

// Checks the student and course exist, share a school, and belong to the caller's school.
const loadPair = async (req, res) => {
  const { student_id, course_id } = req.body;
  if (!validId(student_id) || !validId(course_id)) {
    res.status(400).json({ error: 'student_id and course_id required' });
    return null;
  }
  const course = await getCourse(course_id);
  if (!course) { res.status(404).json({ error: 'Course not found' }); return null; }
  if (!sameSchool(req.user, course.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  const st = await getUser(student_id);
  if (!st || st.role !== 'student' || Number(st.school_id) !== Number(course.school_id)) {
    res.status(404).json({ error: 'Student not found in this school' });
    return null;
  }
  return { student: st, course };
};

const create = async (req, res) => {
  try {
    const p = await loadPair(req, res);
    if (!p) return;
    const enrollment = await enroll({ student_id: p.student.id, course_id: p.course.id });
    res.status(201).json({ enrollment });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Student already enrolled' });
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ enrollments: await getEnrollmentsByStudent(access.student.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byCourse = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const course = await getCourse(req.params.course_id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, course.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ enrollments: await getEnrollmentsByCourse(course.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const p = await loadPair(req, res);
    if (!p) return;
    await unenroll({ student_id: p.student.id, course_id: p.course.id });
    res.json({ message: 'Unenrolled successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, byStudent, byCourse, remove };
