const pool = require('../config/db');
const create = async ({ school_id, created_by, title, body, target_role, class_id, course_id }) => { const r = await pool.query(`INSERT INTO announcements (school_id,created_by,title,body,target_role,class_id,course_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [school_id, created_by, title, body, target_role || 'all', class_id || null, course_id || null]); return r.rows[0]; };
const getForStudent = async (student_id, school_id) => {
  const r = await pool.query(`
    SELECT a.*,u.full_name as author_name,u.role as author_role
    FROM announcements a
    JOIN users u ON u.id=a.created_by
    WHERE a.school_id=$1
    AND (
      a.target_role IN ('all','student')
      OR (a.class_id IN (SELECT class_id FROM student_classes WHERE student_id=$2))
      OR (a.course_id IN (SELECT course_id FROM enrollments WHERE student_id=$2))
    )
    ORDER BY a.created_at DESC LIMIT 50
  `, [school_id, student_id]);
  return r.rows;
};
const getForTeacher = async (teacher_id, school_id) => { const r = await pool.query(`SELECT a.*,u.full_name as author_name FROM announcements a JOIN users u ON u.id=a.created_by WHERE a.school_id=$1 AND (a.target_role IN ('all','teacher') OR a.created_by=$2) ORDER BY a.created_at DESC LIMIT 50`, [school_id, teacher_id]); return r.rows; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT a.*,u.full_name as author_name FROM announcements a JOIN users u ON u.id=a.created_by WHERE a.school_id=$1 ORDER BY a.created_at DESC`, [school_id]); return r.rows; };
const remove = async (id) => { await pool.query(`DELETE FROM announcements WHERE id=$1`, [id]); };
module.exports = { create, getForStudent, getForTeacher, getBySchool, remove };
