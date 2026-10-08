const pool = require('../config/db');

const submit = async (req, res) => {
  try {
    const { submission_id, reviewee_id, rating, feedback } = req.body;
    const reviewer_id = req.user.id;
    if (!submission_id || !reviewee_id || !rating) return res.status(400).json({ error: 'submission_id, reviewee_id, rating required' });
    const r = await pool.query(
      `INSERT INTO peer_reviews (submission_id,reviewer_id,reviewee_id,rating,feedback) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [submission_id, reviewer_id, reviewee_id, rating, feedback]
    );
    await pool.query(
      `INSERT INTO peer_review_credits (student_id,review_id,credits) VALUES ($1,$2,5) ON CONFLICT DO NOTHING`,
      [reviewer_id, r.rows[0].id]
    );
    res.status(201).json({ review: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const listBySubmission = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT pr.*,u.full_name as reviewer_name FROM peer_reviews pr JOIN users u ON u.id=pr.reviewer_id WHERE pr.submission_id=$1`,
      [req.params.submission_id]
    );
    res.json({ reviews: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { submit, listBySubmission };
