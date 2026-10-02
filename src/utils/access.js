const pool = require('../config/db');

const validId = (v) => /^\d+$/.test(String(v));

const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

// Can this user see data about this student? Students: themselves. Parents: linked children.
// Staff: only the roles listed in staffRoles, and only in their own school.
const canSeeStudent = async (user, student_id, staffRoles) => {
  if (!validId(student_id)) return { code: 404, error: 'Student not found' };
  const r = await pool.query(`SELECT id, role, school_id FROM users WHERE id=$1`, [student_id]);
  const st = r.rows[0];
  if (!st || st.role !== 'student') return { code: 404, error: 'Student not found' };
  if (user.role === 'super_admin') return { student: st };
  if (user.role === 'student') {
    return Number(user.id) === Number(st.id) ? { student: st } : { code: 403, error: 'Access denied' };
  }
  if (user.role === 'parent') {
    const link = await pool.query(
      `SELECT 1 FROM parent_student WHERE parent_id=$1 AND student_id=$2`, [user.id, st.id]
    );
    return link.rowCount ? { student: st } : { code: 403, error: 'Not your child' };
  }
  if ((staffRoles || []).includes(user.role) && sameSchool(user, st.school_id)) return { student: st };
  return { code: 403, error: 'Access denied' };
};

module.exports = { validId, sameSchool, canSeeStudent };
