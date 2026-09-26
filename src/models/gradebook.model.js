const pool = require('../config/db');
const letterGrade = (score, total) => {
  const pct = (score / total) * 100;
  if (pct >= 90) return 'A+'; if (pct >= 80) return 'A'; if (pct >= 75) return 'B+';
  if (pct >= 70) return 'B'; if (pct >= 65) return 'C+'; if (pct >= 60) return 'C';
  if (pct >= 50) return 'D'; return 'F';
};
const upsert = async ({ school_id, student_id, course_id, assessment_id, score, weight, total_marks, graded_by }) => {
  const grade = letterGrade(score, total_marks || 100);
  const r = await pool.query(`INSERT INTO gradebook (school_id,student_id,course_id,assessment_id,score,weight,letter_grade,graded_by,graded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT (student_id,assessment_id) DO UPDATE SET score=$5,weight=$6,letter_grade=$7,graded_by=$8,graded_at=NOW() RETURNING *`, [school_id, student_id, course_id, assessment_id, score, weight || 100, grade, graded_by || null]);
  return r.rows[0];
};
const getStudentGradebook = async (student_id, course_id) => {
  const r = await pool.query(`SELECT g.*,a.title as assessment_title,a.type,a.total_marks FROM gradebook g JOIN assessments a ON a.id=g.assessment_id WHERE g.student_id=$1 AND g.course_id=$2 ORDER BY g.graded_at DESC`, [student_id, course_id]);
  return r.rows;
};
const getCourseGradebook = async (course_id) => {
  const r = await pool.query(`SELECT g.*,u.full_name,u.email,a.title as assessment_title,a.type,a.total_marks FROM gradebook g JOIN users u ON u.id=g.student_id JOIN assessments a ON a.id=g.assessment_id WHERE g.course_id=$1 ORDER BY u.full_name,g.graded_at DESC`, [course_id]);
  return r.rows;
};
const getGPA = async (student_id, school_id) => {
  const r = await pool.query(`SELECT AVG(score/weight*100) as avg_percent FROM gradebook WHERE student_id=$1 AND school_id=$2`, [student_id, school_id]);
  const avg = parseFloat(r.rows[0].avg_percent) || 0;
  let gpa = 0;
  if (avg >= 90) gpa = 4.0; else if (avg >= 80) gpa = 3.7; else if (avg >= 75) gpa = 3.3;
  else if (avg >= 70) gpa = 3.0; else if (avg >= 65) gpa = 2.7; else if (avg >= 60) gpa = 2.3;
  else if (avg >= 50) gpa = 2.0; else gpa = 0.0;
  return { avg_percent: avg.toFixed(2), gpa: gpa.toFixed(2) };
};
module.exports = { upsert, getStudentGradebook, getCourseGradebook, getGPA };
