const { issueCertificate, getCertificate, getStudentCertificates } = require('../models/certificate.model');

const issue = async (req, res) => {
  try {
    const { student_id, course_id, school_id, certificate_url } = req.body;
    if (!student_id || !course_id || !school_id) return res.status(400).json({ error: 'student_id, course_id, school_id required' });
    const cert = await issueCertificate({ student_id, course_id, school_id, certificate_url });
    res.status(201).json({ certificate: cert });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const get = async (req, res) => {
  try {
    const cert = await getCertificate(req.params.student_id, req.params.course_id);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ certificate: cert });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listStudentCerts = async (req, res) => {
  try {
    const certs = await getStudentCertificates(req.params.student_id);
    res.json({ certificates: certs });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { issue, get, listStudentCerts };
