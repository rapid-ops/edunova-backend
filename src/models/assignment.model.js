const pool = require('../config/db');

const createAssignment = async ({ course_id, title, instructions, due_date, total_marks, allow_late, attachment_url }) => {
  const r = await pool.query(
    `INSERT INTO assessments (course_id, title, type, instructions, due_date, total_marks, allow_late, attachment_url)
     VALUES ($1,$2,'assignment',$3,$4,$5,$6,$7) RETURNING *`,
    [course_id, title, instructions || null, due_date || null, total_marks || 100, allow_late !== false, attachment_url || null]
  );
  return r.rows[0];
};

const getByCourse = async (course_id) => {
  const r = await pool.query(
    `SELECT a.*, (SELECT COUNT(*) FROM submissions s WHERE s.assessment_id=a.id)::int AS submission_count
     FROM assessments a WHERE a.course_id=$1 AND a.type='assignment'
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [course_id]
  );
  return r.rows;
};

const getForStudent = async (student_id) => {
  const r = await pool.query(
    `SELECT a.*, c.title AS course_title,
            s.id AS submission_id, s.status, s.score, s.feedback, s.submitted_at
     FROM assessments a
     JOIN courses c ON c.id=a.course_id
     JOIN enrollments e ON e.course_id=a.course_id AND e.student_id=$1
     LEFT JOIN submissions s ON s.assessment_id=a.id AND s.student_id=$1
     WHERE a.type='assignment'
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`,
    [student_id]
  );
  return r.rows;
};

const getAssignment = async (id) => {
  const r = await pool.query(`SELECT * FROM assessments WHERE id=$1 AND type='assignment'`, [id]);
  return r.rows[0];
};

const getMySubmission = async (assessment_id, student_id) => {
  const r = await pool.query(
    `SELECT * FROM submissions WHERE assessment_id=$1 AND student_id=$2`,
    [assessment_id, student_id]
  );
  return r.rows[0] || null;
};

const submit = async ({ assessment_id, student_id, file_url, text_answer }) => {
  const r = await pool.query(
    `INSERT INTO submissions (assessment_id, student_id, file_url, text_answer, status)
     VALUES ($1,$2,$3,$4,'submitted')
     ON CONFLICT (assessment_id, student_id) DO UPDATE
       SET file_url=COALESCE($3, submissions.file_url),
           text_answer=$4,
           submitted_at=NOW(),
           status='submitted'
       WHERE submissions.status <> 'graded'
     RETURNING *`,
    [assessment_id, student_id, file_url || null, text_answer || null]
  );
  return r.rows[0] || null;
};

const listSubmissions = async (assessment_id) => {
  const r = await pool.query(
    `SELECT s.*, to_jsonb(u) - 'password' - 'password_hash' AS student
     FROM submissions s JOIN users u ON u.id=s.student_id
     WHERE s.assessment_id=$1 ORDER BY s.submitted_at DESC`,
    [assessment_id]
  );
  return r.rows;
};

const getSubmissionWithAssignment = async (id) => {
  const r = await pool.query(
    `SELECT s.*, a.total_marks FROM submissions s
     JOIN assessments a ON a.id=s.assessment_id WHERE s.id=$1`,
    [id]
  );
  return r.rows[0];
};

const grade = async (id, { score, feedback, graded_by }) => {
  const r = await pool.query(
    `UPDATE submissions SET score=$1, feedback=$2, status='graded', graded_by=$3, graded_at=NOW()
     WHERE id=$4 RETURNING *`,
    [score, feedback || null, graded_by, id]
  );
  return r.rows[0];
};

const isParentOf = async (parent_id, student_id) => {
  const r = await pool.query(
    `SELECT 1 FROM parent_student WHERE parent_id=$1 AND student_id=$2`,
    [parent_id, student_id]
  );
  return r.rowCount > 0;
};

module.exports = {
  createAssignment, getByCourse, getForStudent, getAssignment, getMySubmission,
  submit, listSubmissions, getSubmissionWithAssignment, grade, isParentOf
};
