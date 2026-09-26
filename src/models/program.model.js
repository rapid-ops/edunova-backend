const pool = require('../config/db');
const create = async ({ school_id, department_id, name }) => { const r = await pool.query(`INSERT INTO programs (school_id,department_id,name) VALUES ($1,$2,$3) RETURNING *`, [school_id, department_id, name]); return r.rows[0]; };
const getByDepartment = async (department_id) => { const r = await pool.query(`SELECT p.*,COUNT(b.id) as batch_count FROM programs p LEFT JOIN batches b ON b.program_id=p.id WHERE p.department_id=$1 GROUP BY p.id ORDER BY p.name`, [department_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM programs WHERE id=$1`, [id]); };
module.exports = { create, getByDepartment, remove };
