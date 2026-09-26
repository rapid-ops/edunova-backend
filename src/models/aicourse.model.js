const pool = require('../config/db');
const create = async ({ school_id, created_by, prompt, source_type, source_url }) => { const r = await pool.query(`INSERT INTO ai_course_generations (school_id,created_by,prompt,source_type,source_url,status) VALUES ($1,$2,$3,$4,$5,'processing') RETURNING *`, [school_id, created_by, prompt, source_type || 'prompt', source_url]); return r.rows[0]; };
const updateOutline = async (id, outline) => { const r = await pool.query(`UPDATE ai_course_generations SET generated_outline=$1,status='done' WHERE id=$2 RETURNING *`, [JSON.stringify(outline), id]); return r.rows[0]; };
const fail = async (id) => { await pool.query(`UPDATE ai_course_generations SET status='failed' WHERE id=$1`, [id]); };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT acg.*,u.full_name as created_by_name FROM ai_course_generations acg LEFT JOIN users u ON u.id=acg.created_by WHERE acg.school_id=$1 ORDER BY acg.created_at DESC`, [school_id]); return r.rows; };
module.exports = { create, updateOutline, fail, getBySchool };
