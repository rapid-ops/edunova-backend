const pool = require('../config/db');
const upsert = async ({ school_id, student_id, course_id, assessment_id, score, weight }) => {
  const total = weight || 1;
  const pct = score / 100;
  const letter = pct >= 0.9 ? 'A' : pct >= 0.8 ? 'B' : pct >= 0.7 ? 'C' : pct >= 0.6 ? 'D' : 'F';
  const r = await pool.query(`INSERT INTO gradebook (school_id,student_id,course_id,assessment_id,score,weight,letter_grade) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (student_id,assessment_id) DO UPDATE SET score=$5,weight=$6,letter_grade=$7 RETURNING *`, [school_id, student_id, course_id, assessment_id, score, total, letter]);
  return r.rows[0];
};
const getStudentGrades = async (student_id, course_id) => {
  const r = await pool.query(`SELECT g.*,a.title as assessment_title,a.type,a.total_marks FROM gradebook g JOIN assessments a ON a.id=g.assessment_id WHERE g.student_id=$1 AND g.course_id=$2 ORDER BY a.created_at`, [student_id, course_id]);
  return r.rows;
};
const getCourseGradebook = async (course_id) => {
  const r = await pool.query(`SELECT g.*,u.full_name,u.email,a.title as assessment_title FROM gradebook g JOIN users u ON u.id=g.student_id JOIN assessments a ON a.id=g.assessment_id WHERE g.course_id=$1 ORDER BY u.full_name`, [course_id]);
  return r.rows;
};
const getGPA = async (student_id, school_id) => {
  const r = await pool.query(`SELECT AVG(score) as avg_score, COUNT(*) as total FROM gradebook WHERE student_id=$1 AND school_id=$2`, [student_id, school_id]);
  const avg = parseFloat(r.rows[0].avg_score) || 0;
  const gpa = avg >= 90 ? 4.0 : avg >= 80 ? 3.0 : avg >= 70 ? 2.0 : avg >= 60 ? 1.0 : 0.0;
  return { avg_score: avg.toFixed(2), gpa: gpa.toFixed(1), total: r.rows[0].total };
};
module.exports = { upsert, getStudentGrades, getCourseGradebook, getGPA };
