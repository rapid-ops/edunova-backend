const pool = require('../config/db');
const create = async ({ school_id, user_id, subject, body, priority }) => { const r = await pool.query(`INSERT INTO tickets (school_id,user_id,subject,body,priority) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [school_id, user_id, subject, body, priority || 'medium']); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT t.*,u.full_name,u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE t.school_id=$1 ORDER BY t.created_at DESC`, [school_id]); return r.rows; };
const getByUser = async (user_id) => { const r = await pool.query(`SELECT * FROM tickets WHERE user_id=$1 ORDER BY created_at DESC`, [user_id]); return r.rows; };
const updateStatus = async (id, status) => { const r = await pool.query(`UPDATE tickets SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`, [status, id]); return r.rows[0]; };
const addReply = async ({ ticket_id, user_id, body }) => { const r = await pool.query(`INSERT INTO ticket_replies (ticket_id,user_id,body) VALUES ($1,$2,$3) RETURNING *`, [ticket_id, user_id, body]); return r.rows[0]; };
const getReplies = async (ticket_id) => { const r = await pool.query(`SELECT tr.*,u.full_name,u.role FROM ticket_replies tr JOIN users u ON u.id=tr.user_id WHERE tr.ticket_id=$1 ORDER BY tr.created_at`, [ticket_id]); return r.rows; };
module.exports = { create, getBySchool, getByUser, updateStatus, addReply, getReplies };
