const pool = require('../config/db');
const upsert = async ({ student_id, course_id, score }) => {
  const existing = await pool.query(`SELECT * FROM adaptive_learning_profiles WHERE student_id=$1 AND course_id=$2`, [student_id, course_id]);
  let level = 5, attempts = 1, avg = score;
  if (existing.rows[0]) {
    attempts = existing.rows[0].attempts + 1;
    avg = ((existing.rows[0].avg_score * existing.rows[0].attempts) + score) / attempts;
    level = avg >= 85 ? Math.min(existing.rows[0].difficulty_level + 1, 10) : avg < 50 ? Math.max(existing.rows[0].difficulty_level - 1, 1) : existing.rows[0].difficulty_level;
  }
  const r = await pool.query(`INSERT INTO adaptive_learning_profiles (student_id,course_id,difficulty_level,avg_score,attempts) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (student_id,course_id) DO UPDATE SET difficulty_level=$3,avg_score=$4,attempts=$5,last_updated=NOW() RETURNING *`, [student_id, course_id, level, avg, attempts]);
  return r.rows[0];
};
const get = async (student_id, course_id) => { const r = await pool.query(`SELECT * FROM adaptive_learning_profiles WHERE student_id=$1 AND course_id=$2`, [student_id, course_id]); return r.rows[0]; };
module.exports = { upsert, get };
