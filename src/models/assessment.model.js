const pool = require('../config/db');

const createAssessment = async ({ course_id, title, type, due_date, total_marks, rubric }) => {
  const result = await pool.query(
    `INSERT INTO assessments (course_id, title, type, due_date, total_marks, rubric)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [course_id, title, type, due_date, total_marks, rubric ? JSON.stringify(rubric) : null]
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


const getMyAssessments = async (student_id) => {
  const result = await pool.query(
    `SELECT a.*, c.title AS course_title
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     JOIN enrollments e ON e.course_id = a.course_id
     WHERE e.student_id = $1 AND a.type != 'quiz'
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [student_id]
  );
  return result.rows;
};

const getMyAssessments = async (student_id) => {
  const result = await pool.query(
    `SELECT a.*, c.title AS course_title
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     JOIN enrollments e ON e.course_id = a.course_id
     WHERE e.student_id = $1 AND a.type != 'quiz'
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [student_id]
  );
  return result.rows;
};
module.exports = { createAssessment, getAssessmentsByCourse, getAssessmentById, deleteAssessment, getMyAssessments };
