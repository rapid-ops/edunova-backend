const pool = require('../config/db');

const createLesson = async ({ course_id, title, content, video_url, file_url, position }) => {
  const result = await pool.query(
    `INSERT INTO lessons (course_id, title, content, video_url, file_url, position)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [course_id, title, content, video_url, file_url, position]
  );
  return result.rows[0];
};

const getLessonsByCourse = async (course_id) => {
  const result = await pool.query(
    `SELECT * FROM lessons WHERE course_id=$1 ORDER BY position ASC`,
    [course_id]
  );
  return result.rows;
};

const getLessonById = async (id) => {
  const result = await pool.query(`SELECT * FROM lessons WHERE id=$1`, [id]);
  return result.rows[0];
};

const updateLesson = async (id, fields) => {
  const { title, content, video_url, file_url, position } = fields;
  const result = await pool.query(
    `UPDATE lessons SET title=$1, content=$2, video_url=$3, file_url=$4, position=$5 WHERE id=$6 RETURNING *`,
    [title, content, video_url, file_url, position, id]
  );
  return result.rows[0];
};

const deleteLesson = async (id) => {
  await pool.query(`DELETE FROM lessons WHERE id=$1`, [id]);
};

module.exports = { createLesson, getLessonsByCourse, getLessonById, updateLesson, deleteLesson };
