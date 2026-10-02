const pool = require('../config/db');
const m = require('../models/review.model');
const { isEnrolled } = require('../models/assignment.model');

const validId = (v) => /^\d+$/.test(String(v));
const sameSchool = (user, schoolId) =>
  user.role === 'super_admin' ||
  (user.school_id != null && schoolId != null && Number(user.school_id) === Number(schoolId));

const loadCourse = async (req, res) => {
  if (!validId(req.params.course_id)) { res.status(404).json({ error: 'Course not found' }); return null; }
  const r = await pool.query(`SELECT id, school_id, title FROM courses WHERE id=$1`, [req.params.course_id]);
  const c = r.rows[0];
  if (!c) { res.status(404).json({ error: 'Course not found' }); return null; }
  if (!sameSchool(req.user, c.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return c;
};

const get = async (req, res) => {
  try {
    const c = await loadCourse(req, res);
    if (!c) return;
    const [summary, rows] = await Promise.all([m.getSummary(c.id), m.listReviews(c.id)]);
    const isStudent = req.user.role === 'student';
    const reviews = rows.map((v) => ({
      id: v.id,
      rating: v.rating,
      comment: v.comment,
      created_at: v.created_at,
      updated_at: v.updated_at,
      student_name: v.student_name,
      mine: isStudent && Number(v.student_id) === Number(req.user.id),
    }));
    const my_review = reviews.find((v) => v.mine) || null;
    const can_review = isStudent ? await isEnrolled(req.user.id, c.id) : false;
    res.json({ course_title: c.title, summary, reviews, my_review, can_review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const upsert = async (req, res) => {
  try {
    const c = await loadCourse(req, res);
    if (!c) return;
    if (!(await isEnrolled(req.user.id, c.id))) {
      return res.status(403).json({ error: 'Only students enrolled in this course can rate it' });
    }
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5' });
    }
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 1000) : null;
    const review = await m.upsertReview({ course_id: c.id, student_id: req.user.id, rating, comment: comment || null });
    res.json({ review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeMine = async (req, res) => {
  try {
    const c = await loadCourse(req, res);
    if (!c) return;
    const n = await m.deleteMine(c.id, req.user.id);
    if (!n) return res.status(404).json({ error: 'You have not reviewed this course' });
    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const moderate = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Review not found' });
    const v = await m.getReviewWithSchool(req.params.id);
    if (!v) return res.status(404).json({ error: 'Review not found' });
    if (!sameSchool(req.user, v.course_school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.deleteById(v.id);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { get, upsert, removeMine, moderate };
