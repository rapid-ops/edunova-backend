const pool = require('../config/db');
const save = async ({ student_id, school_id, cv_text, gaps, recommendations }) => { const r = await pool.query(`INSERT INTO skill_gap_analyses (student_id,school_id,cv_text,gaps,recommendations) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [student_id, school_id, cv_text, JSON.stringify(gaps), JSON.stringify(recommendations)]); return r.rows[0]; };
const getByStudent = async (student_id) => { const r = await pool.query(`SELECT * FROM skill_gap_analyses WHERE student_id=$1 ORDER BY created_at DESC LIMIT 5`, [student_id]); return r.rows; };
module.exports = { save, getByStudent };
