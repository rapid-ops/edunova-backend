const pool = require('../config/db');
const { upsertProgress, getCourseProgress, getCourseCompletionPercent } = require('../models/progress.model');
const { issueCertificate } = require('../models/certificate.model');
const { validId, sameSchool, canSeeStudent } = require('../utils/access');

const updateProgress = async (req, res) => {
  try {
    const { lesson_id, course_id, watch_percent, completed } = req.body;
    if (!validId(lesson_id) || !validId(course_id)) return res.status(400).json({ error: 'lesson_id and course_id required' });
    const r = await pool.query(
      `SELECT l.id, l.course_id, c.school_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1`, [lesson_id]
    );
    const lesson = r.rows[0];
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (Number(lesson.course_id) !== Number(course_id)) return res.status(400).json({ error: 'That lesson is not in this course' });
    if (!sameSchool(req.user, lesson.school_id)) return res.status(403).json({ error: 'Access denied' });
    let wp;
    if (watch_percent !== undefined && watch_percent !== null && watch_percent !== '') {
      wp = Number(watch_percent);
      if (!Number.isFinite(wp) || wp < 0 || wp > 100) return res.status(400).json({ error: 'watch_percent must be 0 to 100' });
    }
    const student_id = req.user.id;
    const progress = await upsertProgress({
      student_id, lesson_id: lesson.id, course_id: lesson.course_id,
      watch_percent: wp, completed: typeof completed === 'boolean' ? completed : undefined,
    });
    const percent = await getCourseCompletionPercent(student_id, lesson.course_id);
    let certificate = null;
    if (percent === 100) {
      certificate = await issueCertificate({ student_id, course_id: lesson.course_id, school_id: lesson.school_id });
    }
    res.json({ progress, course_completion_percent: percent, certificate });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getCourseProgressHandler = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    if (!validId(req.params.course_id)) return res.status(404).json({ error: 'Course not found' });
    const c = await pool.query(`SELECT school_id FROM courses WHERE id=$1`, [req.params.course_id]);
    if (!c.rows[0] || Number(c.rows[0].school_id) !== Number(access.student.school_id)) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const progress = await getCourseProgress(access.student.id, req.params.course_id);
    const percent = await getCourseCompletionPercent(access.student.id, req.params.course_id);
    res.json({ progress, completion_percent: percent });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { updateProgress, getCourseProgressHandler };
