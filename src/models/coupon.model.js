const pool = require('../config/db');
const create = async ({ school_id, code, discount_percent, max_uses, expires_at }) => { const r = await pool.query(`INSERT INTO coupons (school_id,code,discount_percent,max_uses,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [school_id, code.toUpperCase(), discount_percent, max_uses || 1, expires_at]); return r.rows[0]; };
const validate = async (code, school_id) => { const r = await pool.query(`SELECT * FROM coupons WHERE code=$1 AND school_id=$2 AND is_active=true AND used_count<max_uses AND (expires_at IS NULL OR expires_at>NOW())`, [code.toUpperCase(), school_id]); return r.rows[0]; };
const use = async (id) => { await pool.query(`UPDATE coupons SET used_count=used_count+1 WHERE id=$1`, [id]); };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT * FROM coupons WHERE school_id=$1 ORDER BY created_at DESC`, [school_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM coupons WHERE id=$1`, [id]); };
module.exports = { create, validate, use, getBySchool, remove };
