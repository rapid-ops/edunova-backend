const pool = require('../config/db');

const upsertProgress = async ({ student_id, lesson_id, course_id, watch_percent, completed }) => {
  const result = await pool.query(
    `INSERT INTO lesson_progress (student_id, lesson_id, course_id, watch_percent, completed, last_watched_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (student_id, lesson_id) DO UPDATE
     SET watch_percent=GREATEST(lesson_progress.watch_percent, $4),
         completed=$5,
         last_watched_at=NOW()
     RETURNING *`,
    [student_id, lesson_id, course_id, watch_percent || 0, completed || false]
  );
  return result.rows[0];
};

const getCourseProgress = async (student_id, course_id) => {
  const result = await pool.query(
    `SELECT lp.*, l.title as lesson_title FROM lesson_progress lp
     JOIN lessons l ON l.id = lp.lesson_id
     WHERE lp.student_id=$1 AND lp.course_id=$2`,
    [student_id, course_id]
  );
  return result.rows;
};

const getCourseCompletionPercent = async (student_id, course_id) => {
  const result = await pool.query(
    `SELECT
       COUNT(l.id) as total_lessons,
       COUNT(lp.id) FILTER (WHERE lp.completed=true) as completed_lessons
     FROM lessons l
     LEFT JOIN lesson_progress lp ON lp.lesson_id=l.id AND lp.student_id=$1
     WHERE l.course_id=$2`,
    [student_id, course_id]
  );
  const { total_lessons, completed_lessons } = result.rows[0];
  if (!total_lessons || total_lessons == 0) return 0;
  return Math.round((completed_lessons / total_lessons) * 100);
};

module.exports = { upsertProgress, getCourseProgress, getCourseCompletionPercent };
