const pool = require('../config/db');
const create = async ({ course_id, school_id, title, description, lab_url, lab_type }) => { const r = await pool.query(`INSERT INTO virtual_labs (course_id,school_id,title,description,lab_url,lab_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [course_id, school_id, title, description, lab_url, lab_type || 'simulation']); return r.rows[0]; };
const getByCourse = async (course_id) => { const r = await pool.query(`SELECT * FROM virtual_labs WHERE course_id=$1 ORDER BY created_at DESC`, [course_id]); return r.rows; };
const submit = async ({ lab_id, student_id, data, score }) => { const r = await pool.query(`INSERT INTO lab_submissions (lab_id,student_id,data,score) VALUES ($1,$2,$3,$4) ON CONFLICT (lab_id,student_id) DO UPDATE SET data=$3,score=$4,submitted_at=NOW() RETURNING *`, [lab_id, student_id, JSON.stringify(data || {}), score]); return r.rows[0]; };
const getSubmissions = async (lab_id) => { const r = await pool.query(`SELECT ls.*,u.full_name FROM lab_submissions ls JOIN users u ON u.id=ls.student_id WHERE ls.lab_id=$1 ORDER BY ls.submitted_at DESC`, [lab_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM virtual_labs WHERE id=$1`, [id]); };
module.exports = { create, getByCourse, submit, getSubmissions, remove };
