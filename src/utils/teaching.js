const pool = require('../config/db');
const { sameSchool } = require('./access');

const MAX_BULK = 500;
const validId = (v) => /^\d+$/.test(String(v));
const isAdmin = (u) => u.role === 'super_admin' || u.role === 'school_admin';
const cleanIds = (arr) =>
  [...new Set((Array.isArray(arr) ? arr : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n <= 2147483647);
const likeText = (q) => String(q || '').trim().slice(0, 60).replace(/[\\%_]/g, '\\$&');

const getCourseFull = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(
    `SELECT id, school_id, title, teacher_id, class_id, is_published, allow_self_enrollment FROM courses WHERE id=$1`, [id]);
  return r.rows[0] || null;
};
const getClassFull = async (id) => {
  if (!validId(id)) return null;
  const r = await pool.query(`SELECT id, school_id, name, teacher_id, capacity, room FROM classes WHERE id=$1`, [id]);
  return r.rows[0] || null;
};
// A teacher teaches a course when they own it or are assigned to it
const teachesCourse = async (userId, courseId) => {
  const r = await pool.query(
    `SELECT 1 FROM courses WHERE id=$1 AND teacher_id=$2
     UNION SELECT 1 FROM course_assignments WHERE course_id=$1 AND teacher_id=$2 LIMIT 1`, [courseId, userId]);
  return r.rowCount > 0;
};
// A teacher owns a class when they are its class teacher or teach a course linked to it
const ownsClass = async (userId, classId) => {
  const r = await pool.query(
    `SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2
     UNION SELECT 1 FROM courses c WHERE c.class_id=$1 AND (c.teacher_id=$2
       OR EXISTS (SELECT 1 FROM course_assignments ca WHERE ca.course_id=c.id AND ca.teacher_id=$2))
     LIMIT 1`, [classId, userId]);
  return r.rowCount > 0;
};
const canManageCourse = async (user, course) => {
  if (user.role === 'super_admin') return true;
  if (!sameSchool(user, course.school_id)) return false;
  if (user.role === 'school_admin') return true;
  if (user.role === 'teacher') return teachesCourse(user.id, course.id);
  return false;
};
const canManageClass = async (user, cls) => {
  if (user.role === 'super_admin') return true;
  if (!sameSchool(user, cls.school_id)) return false;
  if (user.role === 'school_admin') return true;
  if (user.role === 'teacher') return ownsClass(user.id, cls.id);
  return false;
};
const validStudents = async (ids, school_id) => {
  if (!ids.length) return [];
  const r = await pool.query(
    `SELECT id FROM users WHERE id = ANY($1::int[]) AND role='student' AND school_id=$2`, [ids, school_id]);
  return r.rows.map((x) => x.id);
};
const inTxn = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  MAX_BULK, validId, isAdmin, cleanIds, likeText, getCourseFull, getClassFull,
  teachesCourse, ownsClass, canManageCourse, canManageClass, validStudents, inTxn,
};
