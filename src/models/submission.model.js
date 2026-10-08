const pool = require('../config/db');

const create = async ({ assessment_id, student_id, file_url, text_answer }) => {
  const r = await pool.query(
    `INSERT INTO submissions (assessment_id, student_id, file_url, text_answer, status)
     VALUES ($1,$2,$3,$4,'submitted') RETURNING *`,
    [assessment_id, student_id, file_url || null, text_answer || null]
  );
  return r.rows[0];
};

const getByAssessment = async (assessment_id) => {
  const r = await pool.query(
    `SELECT s.*, u.full_name, u.email
     FROM submissions s JOIN users u ON u.id=s.student_id
     WHERE s.assessment_id=$1 ORDER BY s.created_at DESC`,
    [assessment_id]
  );
  return r.rows;
};

const getByStudent = async (assessment_id, student_id) => {
  const r = await pool.query(
    `SELECT * FROM submissions WHERE assessment_id=$1 AND student_id=$2`,
    [assessment_id, student_id]
  );
  return r.rows[0] || null;
};

const grade = async ({ id, score, feedback, graded_by }) => {
  const r = await pool.query(
    `UPDATE submissions
     SET score=$2, feedback=$3, graded_by=$4, graded_at=NOW(), status='graded'
     WHERE id=$1 RETURNING *`,
    [id, score, feedback || null, graded_by]
  );
  return r.rows[0];
};

module.exports = { create, getByAssessment, getByStudent, grade };
