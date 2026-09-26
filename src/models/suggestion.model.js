const pool = require('../config/db');
const create = async ({ school_id, role, content }) => { const r = await pool.query(`INSERT INTO suggestions (school_id,role,content) VALUES ($1,$2,$3) RETURNING id,status,created_at`, [school_id, role, content]); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT * FROM suggestions WHERE school_id=$1 ORDER BY created_at DESC`, [school_id]); return r.rows; };
const reply = async (id, admin_reply) => { const r = await pool.query(`UPDATE suggestions SET admin_reply=$1,status='addressed',replied_at=NOW() WHERE id=$2 RETURNING *`, [admin_reply, id]); return r.rows[0]; };
const markRead = async (id) => { await pool.query(`UPDATE suggestions SET status='read' WHERE id=$1 AND status='unread'`, [id]); };
module.exports = { create, getBySchool, reply, markRead };
