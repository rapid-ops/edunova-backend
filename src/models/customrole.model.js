const pool = require('../config/db');
const create = async ({ school_id, name, permissions }) => { const r = await pool.query(`INSERT INTO custom_roles (school_id,name,permissions) VALUES ($1,$2,$3) RETURNING *`, [school_id, name, JSON.stringify(permissions || [])]); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT * FROM custom_roles WHERE school_id=$1 ORDER BY name`, [school_id]); return r.rows; };
const update = async (id, { name, permissions }) => { const r = await pool.query(`UPDATE custom_roles SET name=$1,permissions=$2 WHERE id=$3 RETURNING *`, [name, JSON.stringify(permissions), id]); return r.rows[0]; };
const remove = async (id) => { await pool.query(`DELETE FROM custom_roles WHERE id=$1`, [id]); };
const assignToUser = async (user_id, role_id) => { await pool.query(`INSERT INTO user_custom_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [user_id, role_id]); };
const getUserRoles = async (user_id) => { const r = await pool.query(`SELECT cr.* FROM custom_roles cr JOIN user_custom_roles ucr ON ucr.role_id=cr.id WHERE ucr.user_id=$1`, [user_id]); return r.rows; };
const hasPermission = async (user_id, permission) => { const r = await pool.query(`SELECT cr.permissions FROM custom_roles cr JOIN user_custom_roles ucr ON ucr.role_id=cr.id WHERE ucr.user_id=$1`, [user_id]); return r.rows.some(row => row.permissions.includes(permission)); };
module.exports = { create, getBySchool, update, remove, assignToUser, getUserRoles, hasPermission };
