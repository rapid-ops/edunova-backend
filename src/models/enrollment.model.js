const pool = require('../config/db');

const enroll = async ({ student_id, course_id }) => {
  const result = await pool.query(
    `INSERT INTO enrollments (student_id, course_id)
     VALUES ($1, $2) RETURNING *`,
    [student_id, course_id]
  );
  return result.rows[0];
};

const getEnrollmentsByStudent = async (student_id) => {
  const result = await pool.query(
    `SELECT e.*, c.title as course_title FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE e.student_id=$1`,
    [student_id]
  );
  return result.rows;
};

const getEnrollmentsByCourse = async (course_id) => {
  const result = await pool.query(
    `SELECT e.*, u.full_name, u.email FROM enrollments e
     JOIN users u ON e.student_id = u.id
     WHERE e.course_id=$1`,
    [course_id]
  );
  return result.rows;
};

const unenroll = async ({ student_id, course_id }) => {
  await pool.query(
    `DELETE FROM enrollments WHERE student_id=$1 AND course_id=$2`,
    [student_id, course_id]
  );
};

module.exports = { enroll, getEnrollmentsByStudent, getEnrollmentsByCourse, unenroll };
