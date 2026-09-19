const pool = require('../config/db');

const markAttendance = async ({ school_id, student_id, class_id, date, status }) => {
  const result = await pool.query(
    `INSERT INTO attendance (school_id, student_id, class_id, date, status)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING RETURNING *`,
    [school_id, student_id, class_id, date, status]
  );
  return result.rows[0];
};

const getAttendanceByClass = async (class_id, date) => {
  const result = await pool.query(
    `SELECT a.*, u.full_name FROM attendance a
     JOIN users u ON a.student_id = u.id
     WHERE a.class_id=$1 AND a.date=$2`,
    [class_id, date]
  );
  return result.rows;
};

const getAttendanceByStudent = async (student_id) => {
  const result = await pool.query(
    `SELECT * FROM attendance WHERE student_id=$1 ORDER BY date DESC`,
    [student_id]
  );
  return result.rows;
};

module.exports = { markAttendance, getAttendanceByClass, getAttendanceByStudent };
