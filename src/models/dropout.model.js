const pool = require('../config/db');
const predict = async (school_id) => {
  const students = await pool.query(`SELECT u.id,u.full_name,u.email FROM users u WHERE u.school_id=$1 AND u.role='student'`, [school_id]);
  const predictions = [];
  for (const s of students.rows) {
    const events = await pool.query(`SELECT COUNT(*) as cnt FROM analytics_events WHERE student_id=$1 AND created_at>NOW()-INTERVAL '7 days'`, [s.id]);
    const submissions = await pool.query(`SELECT COUNT(*) as cnt FROM quiz_attempts WHERE student_id=$1 AND submitted_at>NOW()-INTERVAL '14 days'`, [s.id]);
    const progress = await pool.query(`SELECT COUNT(*) as cnt FROM lesson_progress WHERE student_id=$1 AND last_watched_at>NOW()-INTERVAL '7 days'`, [s.id]);
    const activityScore = parseInt(events.rows[0].cnt) + parseInt(submissions.rows[0].cnt) * 2 + parseInt(progress.rows[0].cnt);
    const riskScore = Math.max(0, 100 - activityScore * 10);
    const riskLevel = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
    const factors = { events_7d: events.rows[0].cnt, submissions_14d: submissions.rows[0].cnt, lessons_7d: progress.rows[0].cnt };
    if (riskScore >= 40) {
      await pool.query(`INSERT INTO dropout_predictions (student_id,school_id,risk_score,risk_level,factors) VALUES ($1,$2,$3,$4,$5)`, [s.id, school_id, riskScore, riskLevel, JSON.stringify(factors)]);
      if (riskScore >= 60) { await pool.query(`INSERT INTO notifications (school_id,user_id,title,body,type) VALUES ($1,$2,'Intervention Needed','A student shows high dropout risk. Please reach out.','dropout_risk')`, [school_id, s.id]); await pool.query(`UPDATE dropout_predictions SET intervention_triggered=true,intervention_type='notification' WHERE student_id=$1 AND school_id=$2`, [s.id, school_id]); }
      predictions.push({ ...s, risk_score: riskScore, risk_level: riskLevel, factors });
    }
  }
  return predictions;
};
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT dp.*,u.full_name,u.email FROM dropout_predictions dp JOIN users u ON u.id=dp.student_id WHERE dp.school_id=$1 ORDER BY dp.risk_score DESC,dp.predicted_at DESC`, [school_id]); return r.rows; };
module.exports = { predict, getBySchool };
