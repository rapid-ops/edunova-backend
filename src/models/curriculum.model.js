const pool = require('../config/db');
const create = async ({ school_id, name, framework, description }) => { const r = await pool.query(`INSERT INTO curriculum_standards (school_id,name,framework,description) VALUES ($1,$2,$3,$4) RETURNING *`, [school_id, name, framework, description]); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT cs.*,COUNT(cst.course_id) as course_count FROM curriculum_standards cs LEFT JOIN course_standards cst ON cst.standard_id=cs.id WHERE cs.school_id=$1 GROUP BY cs.id ORDER BY cs.name`, [school_id]); return r.rows; };
const linkCourse = async (course_id, standard_id) => { await pool.query(`INSERT INTO course_standards (course_id,standard_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [course_id, standard_id]); };
const getByCourse = async (course_id) => { const r = await pool.query(`SELECT cs.* FROM curriculum_standards cs JOIN course_standards cst ON cst.standard_id=cs.id WHERE cst.course_id=$1`, [course_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM curriculum_standards WHERE id=$1`, [id]); };
module.exports = { create, getBySchool, linkCourse, getByCourse, remove };
