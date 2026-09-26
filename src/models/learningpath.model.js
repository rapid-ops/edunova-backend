const pool = require('../config/db');
const create = async ({ school_id, title, description }) => {
  const r = await pool.query(`INSERT INTO learning_paths (school_id,title,description) VALUES ($1,$2,$3) RETURNING *`, [school_id, title, description]);
  return r.rows[0];
};
const addCourse = async ({ path_id, course_id, position, prerequisite_course_id }) => {
  const r = await pool.query(`INSERT INTO learning_path_courses (path_id,course_id,position,prerequisite_course_id) VALUES ($1,$2,$3,$4) ON CONFLICT (path_id,course_id) DO UPDATE SET position=$3,prerequisite_course_id=$4 RETURNING *`, [path_id, course_id, position || 0, prerequisite_course_id || null]);
  return r.rows[0];
};
const getBySchool = async (school_id) => {
  const r = await pool.query(`SELECT lp.*,json_agg(json_build_object('course_id',lpc.course_id,'position',lpc.position,'prerequisite_course_id',lpc.prerequisite_course_id,'title',c.title) ORDER BY lpc.position) as courses FROM learning_paths lp LEFT JOIN learning_path_courses lpc ON lpc.path_id=lp.id LEFT JOIN courses c ON c.id=lpc.course_id WHERE lp.school_id=$1 GROUP BY lp.id ORDER BY lp.created_at DESC`, [school_id]);
  return r.rows;
};
const getById = async (id) => {
  const r = await pool.query(`SELECT lp.*,json_agg(json_build_object('course_id',lpc.course_id,'position',lpc.position,'prerequisite_course_id',lpc.prerequisite_course_id,'title',c.title) ORDER BY lpc.position) as courses FROM learning_paths lp LEFT JOIN learning_path_courses lpc ON lpc.path_id=lp.id LEFT JOIN courses c ON c.id=lpc.course_id WHERE lp.id=$1 GROUP BY lp.id`, [id]);
  return r.rows[0];
};
const checkPrerequisite = async (student_id, prerequisite_course_id) => {
  if (!prerequisite_course_id) return true;
  const r = await pool.query(`SELECT COUNT(*) FROM lesson_progress WHERE student_id=$1 AND course_id=$2 AND completed=true`, [student_id, prerequisite_course_id]);
  return parseInt(r.rows[0].count) > 0;
};
const remove = async (id) => { await pool.query(`DELETE FROM learning_paths WHERE id=$1`, [id]); };
module.exports = { create, addCourse, getBySchool, getById, checkPrerequisite, remove };
