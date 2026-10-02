const pool = require('../config/db');

const getSummary = async (course_id) => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average,
            COUNT(*) FILTER (WHERE rating=1)::int AS s1,
            COUNT(*) FILTER (WHERE rating=2)::int AS s2,
            COUNT(*) FILTER (WHERE rating=3)::int AS s3,
            COUNT(*) FILTER (WHERE rating=4)::int AS s4,
            COUNT(*) FILTER (WHERE rating=5)::int AS s5
     FROM course_reviews WHERE course_id=$1`,
    [course_id]
  );
  const x = r.rows[0];
  return { count: x.count, average: x.average, distribution: { 1: x.s1, 2: x.s2, 3: x.s3, 4: x.s4, 5: x.s5 } };
};

const listReviews = async (course_id) => {
  const r = await pool.query(
    `SELECT v.id, v.student_id, v.rating, v.comment, v.created_at, v.updated_at, u.full_name AS student_name
     FROM course_reviews v JOIN users u ON u.id=v.student_id
     WHERE v.course_id=$1 ORDER BY v.updated_at DESC LIMIT 100`,
    [course_id]
  );
  return r.rows;
};

const upsertReview = async ({ course_id, student_id, rating, comment }) => {
  const r = await pool.query(
    `INSERT INTO course_reviews (course_id, student_id, rating, comment)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (course_id, student_id)
     DO UPDATE SET rating=$3, comment=$4, updated_at=NOW()
     RETURNING *`,
    [course_id, student_id, rating, comment]
  );
  return r.rows[0];
};

const deleteMine = async (course_id, student_id) => {
  const r = await pool.query(
    `DELETE FROM course_reviews WHERE course_id=$1 AND student_id=$2`,
    [course_id, student_id]
  );
  return r.rowCount;
};

const getReviewWithSchool = async (id) => {
  const r = await pool.query(
    `SELECT v.id, c.school_id AS course_school_id
     FROM course_reviews v JOIN courses c ON c.id=v.course_id WHERE v.id=$1`,
    [id]
  );
  return r.rows[0] || null;
};

const deleteById = async (id) => {
  await pool.query(`DELETE FROM course_reviews WHERE id=$1`, [id]);
};

module.exports = { getSummary, listReviews, upsertReview, deleteMine, getReviewWithSchool, deleteById };
