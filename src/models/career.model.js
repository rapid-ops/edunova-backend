const pool = require('../config/db');
const save = async ({ student_id, school_id, matches }) => { await pool.query(`DELETE FROM career_matches WHERE student_id=$1`, [student_id]); for (const m of matches) { await pool.query(`INSERT INTO career_matches (student_id,school_id,job_title,company,match_score,matched_competencies,job_url) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [student_id, school_id, m.job_title, m.company, m.match_score, JSON.stringify(m.matched_competencies || []), m.job_url]); } };
const getByStudent = async (student_id) => { const r = await pool.query(`SELECT * FROM career_matches WHERE student_id=$1 ORDER BY match_score DESC`, [student_id]); return r.rows; };
module.exports = { save, getByStudent };
