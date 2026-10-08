const pool = require('../config/db');
const adaptiveModel = require('../models/adaptive.model');

const recommend = async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id required' });

    // enrolled courses
    const enrolled = await pool.query(
      `SELECT ce.course_id FROM course_enrollments ce WHERE ce.student_id=$1`,
      [student_id]
    );
    const courseIds = enrolled.rows.map(r => r.course_id);
    if (!courseIds.length) return res.json({ recommendations: [] });

    // completed lessons
    const done = await pool.query(
      `SELECT lesson_id FROM lesson_progress WHERE student_id=$1 AND completed=true`,
      [student_id]
    );
    const completedIds = done.rows.map(r => r.lesson_id);

    // adaptive profiles for weak courses (difficulty_level <= 4)
    const profiles = await pool.query(
      `SELECT course_id,difficulty_level,avg_score FROM adaptive_learning_profiles WHERE student_id=$1 ORDER BY avg_score ASC`,
      [student_id]
    );
    const weakCourseIds = profiles.rows.filter(p => p.difficulty_level <= 4).map(p => p.course_id);
    const orderedCourseIds = [
      ...weakCourseIds,
      ...courseIds.filter(id => !weakCourseIds.includes(id))
    ];

    // fetch uncompleted lessons from enrolled courses
    let params = [student_id];
    const inClause = orderedCourseIds.map((_, i) => `$${i + 2}`).join(',');
    let q = `SELECT l.id,l.title,l.course_id,c.name as course_name FROM lessons l
      JOIN courses c ON c.id=l.course_id
      WHERE l.course_id IN (${inClause || '$2'})
      AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE student_id=$1 AND completed=true)
      LIMIT 5`;
    if (!orderedCourseIds.length) return res.json({ recommendations: [] });
    const result = await pool.query(q, [student_id, ...orderedCourseIds]);
    res.json({ recommendations: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { recommend };
