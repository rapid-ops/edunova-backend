const pool = require('../config/db');

const validId = (v) => /^\d+$/.test(String(v));

const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const one = async (sql, id) => {
  if (!validId(id)) return null;
  const r = await pool.query(sql, [id]);
  return r.rows[0] || null;
};
const getUser = (id) => one(`SELECT id, role, school_id FROM users WHERE id=$1`, id);
const getClass = (id) => one(`SELECT id, school_id FROM classes WHERE id=$1`, id);
const getCourse = (id) => one(`SELECT id, school_id FROM courses WHERE id=$1`, id);

// id and school of a row in one of the school-owned tables
const TABLES = ['departments', 'programs', 'batches', 'semesters', 'custom_roles', 'automation_rules', 'competencies'];
const schoolOfRow = (table, id) => (TABLES.includes(table) ? one(`SELECT id, school_id FROM ${table} WHERE id=$1`, id) : null);

// The school a new record belongs to: the admin's own, or (for a super admin) the one named in the request
const schoolForCreate = (req, res) => {
  if (req.user.role === 'super_admin') {
    if (!validId(req.body.school_id)) { res.status(400).json({ error: 'school_id required' }); return null; }
    return Number(req.body.school_id);
  }
  if (req.user.school_id == null) { res.status(403).json({ error: 'Access denied' }); return null; }
  return req.user.school_id;
};

// Can this user see data about this student? Students: themselves. Parents: linked children.
// Staff: only the roles listed in staffRoles, and only in their own school.
const canSeeStudent = async (user, student_id, staffRoles) => {
  const st = await getUser(student_id);
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

module.exports = { validId, sameSchool, canSeeStudent, getUser, getClass, getCourse, schoolOfRow, schoolForCreate };
