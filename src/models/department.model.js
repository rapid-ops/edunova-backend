const pool = require('../config/db');
const create = async ({ school_id, name }) => { const r = await pool.query(`INSERT INTO departments (school_id,name) VALUES ($1,$2) RETURNING *`, [school_id, name]); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT d.*,COUNT(p.id) as program_count FROM departments d LEFT JOIN programs p ON p.department_id=d.id WHERE d.school_id=$1 GROUP BY d.id ORDER BY d.name`, [school_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM departments WHERE id=$1`, [id]); };
module.exports = { create, getBySchool, remove };
