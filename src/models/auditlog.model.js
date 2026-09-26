const pool = require('../config/db');
const log = async ({ school_id, user_id, action, entity, entity_id, meta }) => { await pool.query(`INSERT INTO audit_logs (school_id,user_id,action,entity,entity_id,meta) VALUES ($1,$2,$3,$4,$5,$6)`, [school_id, user_id, action, entity, entity_id, meta ? JSON.stringify(meta) : null]); };
const getBySchool = async (school_id, limit = 100) => { const r = await pool.query(`SELECT al.*,u.full_name,u.role FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE al.school_id=$1 ORDER BY al.created_at DESC LIMIT $2`, [school_id, limit]); return r.rows; };
module.exports = { log, getBySchool };
