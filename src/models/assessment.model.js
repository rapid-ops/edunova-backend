const pool = require('../config/db');

const INSERTABLE = ['title', 'type', 'course_id', 'instructions', 'due_date', 'total_marks', 'allow_late', 'attachment_url', 'rubric', 'scheduled_at'];
const UPDATABLE = ['title', 'instructions', 'due_date', 'total_marks', 'allow_late', 'attachment_url', 'rubric', 'scheduled_at', 'is_published', 'closed_at', 'results_released'];
const val = (c, v) => (c === 'rubric' ? (v ? JSON.stringify(v) : null) : v);

const createAssessment = async (f) => {
  const cols = []; const vals = []; const ph = [];
  INSERTABLE.forEach((c) => { if (f[c] !== undefined) { cols.push(c); vals.push(val(c, f[c])); ph.push('$' + vals.length); } });
  const r = await pool.query(`INSERT INTO assessments (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`, vals);
  return r.rows[0];
};

const updateAssessment = async (id, f) => {
  const sets = []; const vals = [id];
  UPDATABLE.forEach((c) => { if (f[c] !== undefined) { vals.push(val(c, f[c])); sets.push(c + '=$' + vals.length); } });
  if (!sets.length) return getAssessmentById(id);
  const r = await pool.query(`UPDATE assessments SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
  return r.rows[0];
};

const getAssessmentsByCourse = async (course_id, studentView) => {
  const r = await pool.query(
    `SELECT a.*,
       (SELECT COUNT(*) FROM submissions s WHERE s.assessment_id=a.id)::int AS submission_count,
       (SELECT COUNT(*) FROM submissions s WHERE s.assessment_id=a.id AND s.status='graded')::int AS graded_count,
       (SELECT COUNT(*) FROM quiz_questions q WHERE q.assessment_id=a.id)::int AS question_count
     FROM assessments a
     WHERE a.course_id=$1
       ${studentView ? 'AND a.is_published = true AND (a.scheduled_at IS NULL OR a.scheduled_at <= NOW())' : ''}
     ORDER BY a.created_at DESC`, [course_id]);
  return r.rows;
};

const getAssessmentById = async (id) => {
  const r = await pool.query('SELECT * FROM assessments WHERE id=$1', [id]);
  return r.rows[0];
};

const deleteAssessment = async (id) => {
  await pool.query('DELETE FROM assessments WHERE id=$1', [id]);
};

const getMyAssessments = async (student_id) => {
  const r = await pool.query(
    `SELECT a.*, c.title AS course_title,
       ((a.closed_at IS NOT NULL AND a.closed_at <= NOW()) OR (a.due_date IS NOT NULL AND a.due_date < NOW() AND a.allow_late = false)) AS is_closed,
       CASE WHEN s.status = 'graded' AND NOT a.results_released THEN 'submitted' ELSE s.status END AS submission_status,
       CASE WHEN a.results_released THEN s.score END AS submission_score
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = $1
     LEFT JOIN submissions s ON s.assessment_id = a.id AND s.student_id = $1
     WHERE a.type != 'quiz' AND a.is_published = true AND (a.scheduled_at IS NULL OR a.scheduled_at <= NOW())
     ORDER BY a.due_date NULLS LAST, a.created_at DESC`, [student_id]);
  return r.rows;
};

module.exports = { createAssessment, updateAssessment, getAssessmentsByCourse, getAssessmentById, deleteAssessment, getMyAssessments };
