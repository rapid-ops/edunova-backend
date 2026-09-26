const pool = require('../config/db');
const create = async ({ school_id, title, description }) => {
  const r = await pool.query(`INSERT INTO learning_paths (school_id,title,description) VALUES ($1,$2,$3) RETURNING *`, [school_id, title, description]);
  return r.rows[0];
};
const addCourse = async ({ path_id, course_id, position }) => {
  const r = await pool.query(`INSERT INTO learning_path_courses (path_id,course_id,position) VALUES ($1,$2,$3) ON CONFLICT (path_id,course_id) DO UPDATE SET position=$3 RETURNING *`, [path_id, course_id, position || 0]);
  return r.rows[0];
};
const getBySchool = async (school_id) => {
  const r = await pool.query(`SELECT lp.*, json_agg(json_build_object('course_id',lpc.course_id,'position',lpc.position,'title',c.title) ORDER BY lpc.position) as courses FROM learning_paths lp LEFT JOIN learning_path_courses lpc ON lpc.path_id=lp.id LEFT JOIN courses c ON c.id=lpc.course_id WHERE lp.school_id=$1 GROUP BY lp.id ORDER BY lp.created_at DESC`, [school_id]);
  return r.rows;
};
const removeCourse = async (path_id, course_id) => { await pool.query(`DELETE FROM learning_path_courses WHERE path_id=$1 AND course_id=$2`, [path_id, course_id]); };
const remove = async (id) => { await pool.query(`DELETE FROM learning_paths WHERE id=$1`, [id]); };
const isUnlocked = async (student_id, path_id, course_id) => {
  const r = await pool.query(`SELECT position FROM learning_path_courses WHERE path_id=$1 AND course_id=$2`, [path_id, course_id]);
  if (!r.rows[0]) return true;
  const pos = r.rows[0].position;
  if (pos === 0) return true;
  const prev = await pool.query(`SELECT lpc.course_id FROM learning_path_courses lpc WHERE lpc.path_id=$1 AND lpc.position=$2`, [path_id, pos - 1]);
  if (!prev.rows[0]) return true;
  const done = await pool.query(`SELECT completion_percent FROM lesson_progress WHERE student_id=$1 AND course_id=$2 AND completed=true LIMIT 1`, [student_id, prev.rows[0].course_id]);
  return done.rows.length > 0;
};
module.exports = { create, addCourse, getBySchool, removeCourse, remove, isUnlocked };
