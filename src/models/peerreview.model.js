const pool = require('../config/db');
const submitReview = async ({ submission_id, reviewer_id, score, feedback }) => {
  const r = await pool.query(`INSERT INTO peer_reviews (submission_id,reviewer_id,score,feedback,credits_earned) VALUES ($1,$2,$3,$4,1) ON CONFLICT (submission_id,reviewer_id) DO UPDATE SET score=$3,feedback=$4 RETURNING *`, [submission_id, reviewer_id, score, feedback]);
  await pool.query(`INSERT INTO peer_review_credits (student_id,school_id,credits) SELECT $1,u.school_id,1 FROM users u WHERE u.id=$1 ON CONFLICT (student_id,school_id) DO UPDATE SET credits=peer_review_credits.credits+1,updated_at=NOW()`, [reviewer_id]);
  return r.rows[0];
};
const getCredits = async (student_id) => { const r = await pool.query(`SELECT * FROM peer_review_credits WHERE student_id=$1`, [student_id]); return r.rows[0]; };
const spendCredits = async (student_id, amount) => { const r = await pool.query(`UPDATE peer_review_credits SET credits=GREATEST(credits-$1,0),updated_at=NOW() WHERE student_id=$2 RETURNING *`, [amount, student_id]); return r.rows[0]; };
const getReviews = async (submission_id) => { const r = await pool.query(`SELECT pr.*,u.full_name FROM peer_reviews pr JOIN users u ON u.id=pr.reviewer_id WHERE pr.submission_id=$1`, [submission_id]); return r.rows; };
module.exports = { submitReview, getCredits, spendCredits, getReviews };
