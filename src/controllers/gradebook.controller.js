const pool = require('../config/db');
const m = require('../models/gradebook.model');
const { validId, sameSchool, canSeeStudent } = require('../utils/access');

const fail = (res, err) => res.status(500).json({ error: err.message });

const upsert = async (req, res) => {
  try {
    const { student_id, assessment_id, score, weight } = req.body;
    if (!validId(student_id) || !validId(assessment_id)) {
      return res.status(400).json({ error: 'student_id and assessment_id required' });
    }
    const ar = await pool.query(
      `SELECT a.id, a.course_id, c.school_id AS course_school_id
       FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=$1`,
      [assessment_id]
    );
    const a = ar.rows[0];
    if (!a) return res.status(404).json({ error: 'Assessment not found' });
    if (!sameSchool(req.user, a.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    const sr = await pool.query(`SELECT id, role, school_id FROM users WHERE id=$1`, [student_id]);
    const st = sr.rows[0];
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(a.course_school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const sc = Number(score);
    if (score === undefined || score === null || score === '' || !Number.isFinite(sc) || sc < 0 || sc > 100) {
      return res.status(400).json({ error: 'Score must be a percentage from 0 to 100' });
    }
    const w = weight === undefined || weight === null || weight === '' ? 1 : Number(weight);
    if (!Number.isFinite(w) || w <= 0 || w > 100) return res.status(400).json({ error: 'Weight must be above 0 and at most 100' });
    const grade = await m.upsert({
      school_id: a.course_school_id, student_id: st.id, course_id: a.course_id,
      assessment_id: a.id, score: sc, weight: w,
    });
    res.json({ grade });
  } catch (err) { fail(res, err); }
};

const studentGrades = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const c = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [req.params.course_id]);
    if (!c.rows[0] || Number(c.rows[0].school_id) !== Number(access.student.school_id)) {
      return res.status(404).json({ error: 'Course not found' });
    }
    res.json({ grades: await m.getStudentGrades(access.student.id, req.params.course_id) });
  } catch (err) { fail(res, err); }
};

const courseGradebook = async (req, res) => {
  try {
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const c = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [req.params.course_id]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Course not found' });
    if (!sameSchool(req.user, c.rows[0].school_id)) return res.status(403).json({ error: 'Access denied' });
    const grades = await m.getCourseGradebook(req.params.course_id);
    const role = req.user.role;
    let out;
    if (['super_admin', 'school_admin', 'teacher'].includes(role)) {
      out = grades;
    } else if (role === 'student') {
      out = grades.filter((g) => Number(g.student_id) === Number(req.user.id));
    } else if (role === 'parent') {
      const kids = await pool.query(`SELECT student_id FROM parent_student WHERE parent_id=$1`, [req.user.id]);
      const ids = new Set(kids.rows.map((k) => Number(k.student_id)));
      out = grades.filter((g) => ids.has(Number(g.student_id)));
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ grades: out });
  } catch (err) { fail(res, err); }
};

const gpa = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json(await m.getGPA(access.student.id, access.student.school_id));
  } catch (err) { fail(res, err); }
};

module.exports = { upsert, studentGrades, courseGradebook, gpa };
