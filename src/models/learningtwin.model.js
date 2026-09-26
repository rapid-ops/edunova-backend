const pool = require('../config/db');
const getOrCreate = async ({ student_id, school_id }) => { const e = await pool.query(`SELECT * FROM learning_twins WHERE student_id=$1`, [student_id]); if (e.rows[0]) return e.rows[0]; const r = await pool.query(`INSERT INTO learning_twins (student_id,school_id) VALUES ($1,$2) RETURNING *`, [student_id, school_id]); return r.rows[0]; };
const analyze = async (student_id) => {
  const pool2 = require('../config/db');
  const progress = await pool2.query(`SELECT lp.watch_percent,lp.completed,lp.last_watched_at FROM lesson_progress lp WHERE lp.student_id=$1 ORDER BY lp.last_watched_at DESC LIMIT 20`, [student_id]);
  const scores = await pool2.query(`SELECT qa.score,qa.submitted_at FROM quiz_attempts qa WHERE qa.student_id=$1 ORDER BY qa.submitted_at DESC LIMIT 20`, [student_id]);
  const hours = progress.rows.map(p => new Date(p.last_watched_at).getHours());
  const morningCount = hours.filter(h => h >= 6 && h < 12).length;
  const afternoonCount = hours.filter(h => h >= 12 && h < 18).length;
  const eveningCount = hours.filter(h => h >= 18).length;
  const bestTime = morningCount >= afternoonCount && morningCount >= eveningCount ? 'morning' : afternoonCount >= eveningCount ? 'afternoon' : 'evening';
  const avgScore = scores.rows.length ? scores.rows.reduce((a, b) => a + parseFloat(b.score), 0) / scores.rows.length : 0;
  const speed = avgScore >= 75 ? 'fast' : avgScore >= 50 ? 'medium' : 'slow';
  const completedCount = progress.rows.filter(p => p.completed).length;
  const revisionSchedule = [];
  for (let i = 1; i <= 3; i++) { const d = new Date(); d.setDate(d.getDate() + i * (speed === 'fast' ? 3 : speed === 'medium' ? 2 : 1)); revisionSchedule.push({ day: d.toISOString().split('T')[0], sessions: speed === 'slow' ? 3 : 2 }); }
  const r = await pool2.query(`UPDATE learning_twins SET learning_speed=$1,best_study_time=$2,revision_schedule=$3,last_analyzed=NOW() WHERE student_id=$4 RETURNING *`, [speed, bestTime, JSON.stringify(revisionSchedule), student_id]);
  return r.rows[0];
};
const get = async (student_id) => { const r = await pool.query(`SELECT * FROM learning_twins WHERE student_id=$1`, [student_id]); return r.rows[0]; };
module.exports = { getOrCreate, analyze, get };
