const pool = require('../config/db');

const createCourse = async ({ school_id, class_id, teacher_id, title, description }) => {
  const result = await pool.query(
    `INSERT INTO courses (school_id, class_id, teacher_id, title, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [school_id, class_id, teacher_id, title, description]
  );
  return result.rows[0];
};

const getCoursesBySchool = async (school_id) => {
  const result = await pool.query(
    `SELECT c.*, u.full_name as teacher_name 
     FROM courses c
     LEFT JOIN users u ON c.teacher_id = u.id
     WHERE c.school_id = $1 ORDER BY c.created_at DESC`,
    [school_id]
  );
  return result.rows;
};

const getCourseById = async (id) => {
  const result = await pool.query(
    `SELECT c.*, u.full_name as teacher_name
     FROM courses c
     LEFT JOIN users u ON c.teacher_id = u.id
     WHERE c.id = $1`,
    [id]
  );
  return result.rows[0];
};

const updateCourse = async (id, fields) => {
  const { title, description, is_published } = fields;
  const result = await pool.query(
    `UPDATE courses SET title=$1, description=$2, is_published=$3 WHERE id=$4 RETURNING *`,
    [title, description, is_published, id]
  );
  return result.rows[0];
};

const deleteCourse = async (id) => {
  await pool.query(`DELETE FROM courses WHERE id=$1`, [id]);
};

module.exports = { createCourse, getCoursesBySchool, getCourseById, updateCourse, deleteCourse };
