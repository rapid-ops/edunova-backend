const pool = require('../config/db');

const issueCertificate = async ({ student_id, course_id, school_id, certificate_url }) => {
  const result = await pool.query(
    `INSERT INTO certificates (student_id, course_id, school_id, certificate_url)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (student_id, course_id) DO UPDATE SET certificate_url=$4
     RETURNING *`,
    [student_id, course_id, school_id, certificate_url || null]
  );
  return result.rows[0];
};

const getCertificate = async (student_id, course_id) => {
  const result = await pool.query(
    `SELECT c.*, u.full_name, co.title as course_title, s.name as school_name
     FROM certificates c
     JOIN users u ON u.id=c.student_id
     JOIN courses co ON co.id=c.course_id
     JOIN schools s ON s.id=c.school_id
     WHERE c.student_id=$1 AND c.course_id=$2`,
    [student_id, course_id]
  );
  return result.rows[0];
};

const getStudentCertificates = async (student_id) => {
  const result = await pool.query(
    `SELECT c.*, co.title as course_title, s.name as school_name
     FROM certificates c
     JOIN courses co ON co.id=c.course_id
     JOIN schools s ON s.id=c.school_id
     WHERE c.student_id=$1 ORDER BY c.issued_at DESC`,
    [student_id]
  );
  return result.rows;
};

module.exports = { issueCertificate, getCertificate, getStudentCertificates };
