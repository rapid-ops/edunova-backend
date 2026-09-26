const pool = require('../config/db');

const addQuestion = async ({ assessment_id, question, type, options, correct_answer, marks, position }) => {
  const result = await pool.query(
    `INSERT INTO quiz_questions (assessment_id, question, type, options, correct_answer, marks, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [assessment_id, question, type, options ? JSON.stringify(options) : null, correct_answer, marks || 1, position || 0]
  );
  return result.rows[0];
};

const getQuestions = async (assessment_id) => {
  const result = await pool.query(
    `SELECT * FROM quiz_questions WHERE assessment_id=$1 ORDER BY position ASC`,
    [assessment_id]
  );
  return result.rows;
};

const deleteQuestion = async (id) => {
  await pool.query(`DELETE FROM quiz_questions WHERE id=$1`, [id]);
};

const submitAttempt = async ({ assessment_id, student_id, answers, score }) => {
  const result = await pool.query(
    `INSERT INTO quiz_attempts (assessment_id, student_id, answers, score)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (assessment_id, student_id) DO UPDATE SET answers=$3, score=$4, submitted_at=NOW()
     RETURNING *`,
    [assessment_id, student_id, JSON.stringify(answers), score]
  );
  return result.rows[0];
};

const getAttempt = async (assessment_id, student_id) => {
  const result = await pool.query(
    `SELECT * FROM quiz_attempts WHERE assessment_id=$1 AND student_id=$2`,
    [assessment_id, student_id]
  );
  return result.rows[0];
};

const getAllAttempts = async (assessment_id) => {
  const result = await pool.query(
    `SELECT qa.*, u.full_name, u.email FROM quiz_attempts qa
     JOIN users u ON u.id = qa.student_id
     WHERE qa.assessment_id=$1 ORDER BY qa.submitted_at DESC`,
    [assessment_id]
  );
  return result.rows;
};

module.exports = { addQuestion, getQuestions, deleteQuestion, submitAttempt, getAttempt, getAllAttempts };
