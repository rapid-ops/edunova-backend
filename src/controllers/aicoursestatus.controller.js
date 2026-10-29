const pool = require('../config/db');

// Tells the page whether an AI course is ready. The generator saves the outline first and then creates the course
// and its lessons, so "ready" means the course exists with all of its lessons.
const status = async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: 'Not found' });
    const r = await pool.query('SELECT * FROM ai_course_generations WHERE id=$1', [req.params.id]);
    const g = r.rows[0];
    if (!g) return res.status(404).json({ error: 'Not found' });
    if (Number(g.created_by) !== Number(req.user.id) && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Access denied' });
    if (g.status === 'failed') return res.json({ status: 'failed' });
    if (g.status !== 'done') return res.json({ status: 'processing' });
    let outline = g.outline;
    if (typeof outline === 'string') { try { outline = JSON.parse(outline); } catch (e) { outline = null; } }
    const title = outline && outline.title;
    const wanted = Array.isArray(outline && outline.lessons) ? outline.lessons.length : 0;
    const after = /^\d+$/.test(String(req.query.after || '')) ? Number(req.query.after) : 0;
    if (!title) return res.json({ status: 'processing' });
    const c = await pool.query(
      `SELECT c.id, (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id)::int AS n
       FROM courses c
       WHERE c.school_id=$1 AND c.teacher_id=$2 AND c.title=$3 AND c.id>$4
         AND c.created_at > NOW() - INTERVAL '30 minutes'
       ORDER BY c.id DESC LIMIT 1`,
      [g.school_id, g.created_by, title, after]);
    const row = c.rows[0];
    if (row && row.n >= wanted) return res.json({ status: 'ready', course_id: row.id, lessons: row.n });
    res.json({ status: 'processing' });
  } catch (err) {
    console.error('course status error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

module.exports = { status };
