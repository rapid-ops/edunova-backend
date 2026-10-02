const pool = require('../config/db');
const { issueCertificate, getCertificate, getStudentCertificates } = require('../models/certificate.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const issue = async (req, res) => {
  try {
    const { student_id, course_id, certificate_url } = req.body;
    if (!validId(student_id) || !validId(course_id)) {
      return res.status(400).json({ error: 'student_id and course_id required' });
    }
    const course = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [course_id]);
    const student = await pool.query(`SELECT school_id, role FROM users WHERE id=$1`, [student_id]);
    if (!course.rows[0] || !student.rows[0]) return res.status(404).json({ error: 'Course or student not found' });
    const school_id = course.rows[0].school_id;
    if (!sameSchool(req.user, school_id) || Number(student.rows[0].school_id) !== Number(school_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (student.rows[0].role !== 'student') {
      return res.status(400).json({ error: 'Certificates can only be issued to students' });
    }
    const url = typeof certificate_url === 'string' && /^https?:\/\//.test(certificate_url)
      ? certificate_url.slice(0, 500)
      : null;
    const cert = await issueCertificate({
      student_id: Number(student_id),
      course_id: Number(course_id),
      school_id,
      certificate_url: url,
    });
    res.status(201).json({ certificate: cert });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const get = async (req, res) => {
  try {
    if (!validId(req.params.student_id) || !validId(req.params.course_id)) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    const cert = await getCertificate(req.params.student_id, req.params.course_id);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ certificate: cert });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listStudentCerts = async (req, res) => {
  try {
    const sid = req.params.student_id;
    if (!validId(sid)) return res.status(404).json({ error: 'Not found' });
    const u = req.user;
    if (u.role === 'student') {
      if (Number(u.id) !== Number(sid)) return res.status(403).json({ error: 'Access denied' });
    } else if (u.role === 'parent') {
      const link = await pool.query(
        `SELECT 1 FROM parent_student WHERE parent_id=$1 AND student_id=$2`, [u.id, sid]
      );
      if (!link.rowCount) return res.status(403).json({ error: 'Not your child' });
    } else if (u.role !== 'super_admin') {
      const s = await pool.query(`SELECT school_id FROM users WHERE id=$1`, [sid]);
      if (!s.rows[0] || u.school_id == null || Number(s.rows[0].school_id) !== Number(u.school_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const certs = await getStudentCertificates(sid);
    res.json({ certificates: certs });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { issue, get, listStudentCerts };
