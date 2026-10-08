const pool = require('../config/db');
const adaptiveModel = require('../models/adaptive.model');
const recommend = async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id required' });
    const enrolled = await pool.query(`SELECT course_id FROM enrollments WHERE student_id=$1`, [student_id]);
    const courseIds = enrolled.rows.map(r => r.course_id);
    if (!courseIds.length) return res.json({ recommendations: [] });
    const profiles = await pool.query(
      `SELECT course_id,difficulty_level,avg_score FROM adaptive_learning_profiles WHERE student_id=$1 ORDER BY avg_score ASC`,
      [student_id]
    );
    const weakIds = profiles.rows.filter(p => p.difficulty_level <= 4).map(p => p.course_id);
    const orderedIds = [...new Set([...weakIds, ...courseIds])];
    const inClause = orderedIds.map((_, i) => `$${i + 2}`).join(',');
    const result = await pool.query(
      `SELECT l.id,l.title,l.course_id,c.title as course_name FROM lessons l
       JOIN courses c ON c.id=l.course_id
       WHERE l.course_id IN (${inClause})
       AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE student_id=$1 AND completed=true)
       LIMIT 5`,
      [student_id, ...orderedIds]
    );
    res.json({ recommendations: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
module.exports = { recommend };
