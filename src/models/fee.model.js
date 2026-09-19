const pool = require('../config/db');

const createFee = async ({ school_id, student_id, amount, description, due_date }) => {
  const result = await pool.query(
    `INSERT INTO fees (school_id, student_id, amount, description, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [school_id, student_id, amount, description, due_date]
  );
  return result.rows[0];
};

const getFeesByStudent = async (student_id) => {
  const result = await pool.query(
    `SELECT * FROM fees WHERE student_id=$1 ORDER BY created_at DESC`,
    [student_id]
  );
  return result.rows;
};

const getFeesBySchool = async (school_id) => {
  const result = await pool.query(
    `SELECT f.*, u.full_name FROM fees f
     JOIN users u ON f.student_id = u.id
     WHERE f.school_id=$1 ORDER BY f.created_at DESC`,
    [school_id]
  );
  return result.rows;
};

const updateFeeStatus = async (id, status) => {
  const paid_at = status === 'paid' ? new Date() : null;
  const result = await pool.query(
    `UPDATE fees SET status=$1, paid_at=$2 WHERE id=$3 RETURNING *`,
    [status, paid_at, id]
  );
  return result.rows[0];
};

module.exports = { createFee, getFeesByStudent, getFeesBySchool, updateFeeStatus };
