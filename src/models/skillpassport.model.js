const pool = require('../config/db');
const crypto = require('crypto');
const getOrCreate = async (student_id) => {
  const e = await pool.query(`SELECT * FROM skill_passport WHERE student_id=$1`, [student_id]);
  if (e.rows[0]) return e.rows[0];
  const passport_id = 'EDU-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const r = await pool.query(`INSERT INTO skill_passport (student_id,passport_id) VALUES ($1,$2) RETURNING *`, [student_id, passport_id]);
  return r.rows[0];
};
const sync = async (student_id) => {
  const certs = await pool.query(`SELECT co.title,c.issued_at FROM certificates c JOIN courses co ON co.id=c.course_id WHERE c.student_id=$1`, [student_id]);
  const competencies = await pool.query(`SELECT c.name,sc.level,sc.achieved_at FROM student_competencies sc JOIN competencies c ON c.id=sc.competency_id WHERE sc.student_id=$1`, [student_id]);
  const skills = [...certs.rows.map(c => ({ type: 'certificate', name: c.title, date: c.issued_at })), ...competencies.rows.map(c => ({ type: 'competency', name: c.name, level: c.level, date: c.achieved_at }))];
  const r = await pool.query(`UPDATE skill_passport SET skills=$1,verified_at=NOW() WHERE student_id=$2 RETURNING *`, [JSON.stringify(skills), student_id]);
  return r.rows[0];
};
const addExternal = async (student_id, source) => { const r = await pool.query(`UPDATE skill_passport SET external_sources=external_sources||$1::jsonb WHERE student_id=$2 RETURNING *`, [JSON.stringify([source]), student_id]); return r.rows[0]; };
const getByPassportId = async (passport_id) => { const r = await pool.query(`SELECT sp.*,u.full_name FROM skill_passport sp JOIN users u ON u.id=sp.student_id WHERE sp.passport_id=$1`, [passport_id]); return r.rows[0]; };
module.exports = { getOrCreate, sync, addExternal, getByPassportId };
