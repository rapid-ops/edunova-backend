const pool = require('../config/db');
const generate = async ({ student_id, school_id, semester_id }) => {
  const grades = await pool.query(`SELECT g.*,c.title as course_title,c.credits FROM gradebook g JOIN courses c ON c.id=g.course_id WHERE g.student_id=$1 AND g.school_id=$2`, [student_id, school_id]);
  if (!grades.rows.length) return null;
  let totalPoints = 0, totalCredits = 0;
  const entries = grades.rows.map(g => {
    const credits = parseFloat(g.credits) || 3;
    const gp = g.letter_grade === 'A' ? 4.0 : g.letter_grade === 'B' ? 3.0 : g.letter_grade === 'C' ? 2.0 : g.letter_grade === 'D' ? 1.0 : 0.0;
    totalPoints += gp * credits; totalCredits += credits;
    return { course_id: g.course_id, course_title: g.course_title, credits, score: g.score, letter_grade: g.letter_grade, grade_points: gp };
  });
  const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 0;
  const prev = await pool.query(`SELECT AVG(gpa) as cgpa FROM transcripts WHERE student_id=$1 AND school_id=$2`, [student_id, school_id]);
  const cgpa = prev.rows[0].cgpa ? ((parseFloat(prev.rows[0].cgpa) + parseFloat(String(gpa))) / 2).toFixed(2) : gpa;
  const t = await pool.query(`INSERT INTO transcripts (student_id,school_id,semester_id,total_credits,gpa,cgpa) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [student_id, school_id, semester_id || null, totalCredits, gpa, cgpa]);
  const tid = t.rows[0].id;
  for (const e of entries) { await pool.query(`INSERT INTO transcript_entries (transcript_id,course_id,course_title,credits,score,letter_grade,grade_points) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [tid, e.course_id, e.course_title, e.credits, e.score, e.letter_grade, e.grade_points]); }
  return { ...t.rows[0], entries };
};
const getByStudent = async (student_id) => {
  const t = await pool.query(`SELECT tr.*,s.name as semester_name FROM transcripts tr LEFT JOIN semesters s ON s.id=tr.semester_id WHERE tr.student_id=$1 ORDER BY tr.generated_at DESC`, [student_id]);
  const result = [];
  for (const row of t.rows) { const entries = await pool.query(`SELECT * FROM transcript_entries WHERE transcript_id=$1`, [row.id]); result.push({ ...row, entries: entries.rows }); }
  return result;
};
module.exports = { generate, getByStudent };
