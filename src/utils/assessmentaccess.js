const pool = require('../config/db');
const T = require('./teaching');

const load = async (id) => {
  if (!/^\d+$/.test(String(id))) return null;
  const r = await pool.query(
    `SELECT a.*, c.school_id AS course_school_id, c.title AS course_title
     FROM assessments a JOIN courses c ON c.id=a.course_id WHERE a.id=$1`, [id]);
  return r.rows[0] || null;
};
const canManage = (user, a) => T.canManageCourse(user, { id: a.course_id, school_id: a.course_school_id });
const isEnrolled = async (userId, courseId) => {
  const r = await pool.query('SELECT 1 FROM enrollments WHERE student_id=$1 AND course_id=$2 LIMIT 1', [userId, courseId]);
  return r.rowCount > 0;
};
const started = (a) => !a.scheduled_at || new Date(a.scheduled_at) <= new Date();
const visibleToStudent = (a) => a.is_published === true && started(a);
const isClosed = (a) => {
  const now = new Date();
  if (a.closed_at && new Date(a.closed_at) <= now) return true;
  if (a.due_date && new Date(a.due_date) < now && (a.type === 'quiz' || a.allow_late === false)) return true;
  return false;
};
const statusOf = (a) => {
  if (!a.is_published) return 'draft';
  if (!started(a)) return 'scheduled';
  if (isClosed(a)) return 'closed';
  return 'open';
};
const hasWork = async (id) => {
  const r = await pool.query(
    `SELECT (EXISTS (SELECT 1 FROM submissions WHERE assessment_id=$1)
          OR EXISTS (SELECT 1 FROM quiz_attempts WHERE assessment_id=$1)) AS w`, [id]);
  return r.rows[0].w;
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const enrolledIds = async (courseId) => {
  const r = await pool.query('SELECT DISTINCT student_id FROM enrollments WHERE course_id=$1', [courseId]);
  return r.rows.map((x) => x.student_id);
};
const notifyUsers = async (schoolId, userIds, title, body, io) => {
  if (!userIds.length) return 0;
  const r = await pool.query(
    `INSERT INTO notifications (school_id, user_id, title, body, type)
     SELECT $1::int, u, $2::text, $3::text, 'assessment' FROM unnest($4::int[]) AS u RETURNING *`,
    [schoolId, String(title).slice(0, 255), body ? String(body).slice(0, 2000) : null, userIds]);
  if (io) r.rows.forEach((n) => io.to('user_' + n.user_id).emit('new_notification', n));
  return r.rowCount;
};
module.exports = { load, canManage, isEnrolled, started, visibleToStudent, isClosed, statusOf, hasWork, fmtDate, enrolledIds, notifyUsers };
