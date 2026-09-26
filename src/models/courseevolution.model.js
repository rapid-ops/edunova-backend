const pool = require('../config/db');
const { chat } = require('../services/groq.service');

const log = async ({ course_id, change_type, source, suggested_update }) => { const r = await pool.query(`INSERT INTO course_evolution_logs (course_id,change_type,source,suggested_update) VALUES ($1,$2,$3,$4) RETURNING *`, [course_id, change_type, source, suggested_update]); return r.rows[0]; };
const getByCourse = async (course_id) => { const r = await pool.query(`SELECT * FROM course_evolution_logs WHERE course_id=$1 ORDER BY created_at DESC`, [course_id]); return r.rows; };
const apply = async (id) => { await pool.query(`UPDATE course_evolution_logs SET status='applied' WHERE id=$1`, [id]); };
const reject = async (id) => { await pool.query(`UPDATE course_evolution_logs SET status='rejected' WHERE id=$1`, [id]); };

const scan = async ({ course_id, topic }) => {
  try {
    const text = await chat([{ role: 'user', content: `For the topic "${topic}", suggest 3 recent updates that should be added to a course. Return ONLY valid JSON: {"updates":[{"change_type":"new_content","source":"industry trend","suggested_update":"Description of what to add"}]}` }], null, 800);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const saved = [];
    for (const u of parsed.updates || []) { const l = await log({ course_id, change_type: u.change_type, source: u.source, suggested_update: u.suggested_update }); saved.push(l); }
    return saved;
  } catch { return []; }
};

module.exports = { log, getByCourse, apply, reject, scan };
