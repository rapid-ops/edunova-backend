const pool = require('../config/db');

const createAssessment = async ({ course_id, title, type, due_date, total_marks }) => {
  const result = await pool.query(
    `INSERT INTO assessments (course_id, title, type, due_date, total_marks)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [course_id, title, type, due_date, total_marks]
  );
  return result.rows[0];
};

const getAssessmentsByCourse = async (course_id) => {
  const result = await pool.query(
    `SELECT * FROM assessments WHERE course_id=$1 ORDER BY created_at DESC`,
    [course_id]
  );
  return result.rows;
};

const getAssessmentById = async (id) => {
  const result = await pool.query(`SELECT * FROM assessments WHERE id=$1`, [id]);
  return result.rows[0];
};

const deleteAssessment = async (id) => {
  await pool.query(`DELETE FROM assessments WHERE id=$1`, [id]);
};

module.exports = { createAssessment, getAssessmentsByCourse, getAssessmentById, deleteAssessment };
