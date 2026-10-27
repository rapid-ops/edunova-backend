const pool = require('../config/db');

const stats = async (req, res) => {
  try {
    const u = req.user;
    const params = [];
    let where = '';
    if (u.role !== 'super_admin' || u.school_id) {
      params.push(u.school_id);
      where = 'WHERE c.school_id = $1';
      if (u.role === 'teacher') { params.push(u.id); where += ' AND c.teacher_id = $2'; }
    }
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'quiz_attempts'");
    const has = new Set(cols.rows.map((r) => r.column_name));
    const scoreCol = has.has('best_score') ? 'best_score' : 'last_score';
    const r = await pool.query(`
      SELECT a.id, a.title, a.type, a.due_date, a.course_id, c.title AS course_title,
        CASE WHEN a.type = 'quiz' THEN COALESCE(qm.tm, 0) ELSE a.total_marks END AS total_marks,
        CASE WHEN a.type = 'quiz' THEN COALESCE(qa.n, 0) ELSE COALESCE(s.n, 0) END AS submission_count,
        CASE WHEN a.type = 'quiz' THEN COALESCE(qa.n, 0) ELSE COALESCE(s.graded, 0) END AS graded_count,
        CASE WHEN a.type = 'quiz' THEN ROUND((qa.avg_score / NULLIF(qm.tm, 0) * 100)::numeric, 1)
             ELSE ROUND((s.avg_score / NULLIF(a.total_marks, 0) * 100)::numeric, 1) END AS avg_percent
      FROM assessments a
      JOIN courses c ON c.id = a.course_id
      LEFT JOIN (SELECT assessment_id, COUNT(*) AS n, COUNT(*) FILTER (WHERE status = 'graded') AS graded,
                        AVG(score) FILTER (WHERE status = 'graded' AND score IS NOT NULL) AS avg_score
                 FROM submissions GROUP BY assessment_id) s ON s.assessment_id = a.id
      LEFT JOIN (SELECT assessment_id, COUNT(*) AS n,
                        AVG(${scoreCol}) FILTER (WHERE status <> 'in_progress' AND ${scoreCol} IS NOT NULL) AS avg_score
                 FROM quiz_attempts GROUP BY assessment_id) qa ON qa.assessment_id = a.id
      LEFT JOIN (SELECT assessment_id, SUM(marks) AS tm FROM quiz_questions GROUP BY assessment_id) qm ON qm.assessment_id = a.id
      ${where}
      ORDER BY a.created_at DESC`, params);
    const rows = r.rows.map((x) => ({
      ...x,
      total_marks: Number(x.total_marks),
      submission_count: Number(x.submission_count),
      graded_count: Number(x.graded_count),
      avg_percent: x.avg_percent === null ? null : Number(x.avg_percent),
    }));
    let totalSubs = 0, weighted = 0, weight = 0;
    rows.forEach((x) => {
      totalSubs += x.submission_count;
      if (x.avg_percent !== null && x.graded_count > 0) { weighted += x.avg_percent * x.graded_count; weight += x.graded_count; }
    });
    res.json({
      summary: {
        total_assessments: rows.length,
        total_submissions: totalSubs,
        average_percent: weight ? Math.round((weighted / weight) * 10) / 10 : null,
      },
      assessments: rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { stats };
