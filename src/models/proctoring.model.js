const pool = require('../config/db');
const startSession = async ({ assessment_id, student_id }) => { const r = await pool.query(`INSERT INTO proctoring_sessions (assessment_id,student_id) VALUES ($1,$2) RETURNING *`, [assessment_id, student_id]); return r.rows[0]; };
const flagEvent = async (session_id, flag) => { await pool.query(`UPDATE proctoring_sessions SET flags=COALESCE(flags,'[]'::jsonb)||$1::jsonb,tab_switches=tab_switches+(CASE WHEN $2='tab_switch' THEN 1 ELSE 0 END) WHERE id=$3`, [JSON.stringify([flag]), flag.type, session_id]); };
const endSession = async (session_id, recording_url) => { const r = await pool.query(`UPDATE proctoring_sessions SET ended_at=NOW(),status='completed',recording_url=$1 WHERE id=$2 RETURNING *`, [recording_url, session_id]); return r.rows[0]; };
const getByAssessment = async (assessment_id) => { const r = await pool.query(`SELECT ps.*,u.full_name,u.email FROM proctoring_sessions ps JOIN users u ON u.id=ps.student_id WHERE ps.assessment_id=$1 ORDER BY ps.started_at DESC`, [assessment_id]); return r.rows; };
const getByStudent = async (student_id) => { const r = await pool.query(`SELECT ps.*,a.title as assessment_title FROM proctoring_sessions ps JOIN assessments a ON a.id=ps.assessment_id WHERE ps.student_id=$1 ORDER BY ps.started_at DESC`, [student_id]); return r.rows; };
const flag = async (session_id) => { await pool.query(`UPDATE proctoring_sessions SET status='flagged' WHERE id=$1`, [session_id]); };
module.exports = { startSession, flagEvent, endSession, getByAssessment, getByStudent, flag };
