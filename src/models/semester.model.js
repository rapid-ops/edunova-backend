const pool = require('../config/db');
const create = async ({ school_id, batch_id, name, start_date, end_date }) => { const r = await pool.query(`INSERT INTO semesters (school_id,batch_id,name,start_date,end_date) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [school_id, batch_id, name, start_date, end_date]); return r.rows[0]; };
const getByBatch = async (batch_id) => { const r = await pool.query(`SELECT * FROM semesters WHERE batch_id=$1 ORDER BY start_date`, [batch_id]); return r.rows; };
const setActive = async (id, school_id) => { await pool.query(`UPDATE semesters SET is_active=false WHERE school_id=$1`, [school_id]); const r = await pool.query(`UPDATE semesters SET is_active=true WHERE id=$1 RETURNING *`, [id]); return r.rows[0]; };
const remove = async (id) => { await pool.query(`DELETE FROM semesters WHERE id=$1`, [id]); };
module.exports = { create, getByBatch, setActive, remove };
