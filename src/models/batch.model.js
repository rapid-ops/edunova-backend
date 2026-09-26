const pool = require('../config/db');
const create = async ({ school_id, program_id, name, start_date, end_date }) => { const r = await pool.query(`INSERT INTO batches (school_id,program_id,name,start_date,end_date) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [school_id, program_id, name, start_date, end_date]); return r.rows[0]; };
const getByProgram = async (program_id) => { const r = await pool.query(`SELECT b.*,COUNT(s.id) as semester_count FROM batches b LEFT JOIN semesters s ON s.batch_id=b.id WHERE b.program_id=$1 GROUP BY b.id ORDER BY b.start_date DESC`, [program_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM batches WHERE id=$1`, [id]); };
module.exports = { create, getByProgram, remove };
