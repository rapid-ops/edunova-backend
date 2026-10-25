const pool = require('../config/db');
const { validId, sameSchool, canSeeStudent, getUser } = require('../utils/access');

const q = (sql, args) => pool.query(sql, args).then((r) => r.rows);
const safe = async (fn, fallback) => {
  try { return await fn(); } catch (e) { console.error('Portal block failed:', e.message); return fallback; }
};
const num = (v) => (v === null || v === undefined ? null : Number(v));
const pctOf = (score, total) => (Number(total) > 0 && score !== null && score !== undefined ? Math.round((Number(score) / Number(total)) * 1000) / 10 : null);
const LAGOS_DAY = "TO_CHAR(NOW() AT TIME ZONE 'Africa/Lagos', 'FMDay')";
const LAGOS_DATE = "(NOW() AT TIME ZONE 'Africa/Lagos')::date";
const LAGOS_TIME = "(NOW() AT TIME ZONE 'Africa/Lagos')::time";

// One mark per student and assessment: a graded submission wins over a results row.
const MARKS = `(
  SELECT DISTINCT ON (student_id, assessment_id) * FROM (
    SELECT s.student_id, s.assessment_id, s.score::numeric AS score, a.total_marks, a.title AS assessment_title, a.course_id,
           COALESCE(s.graded_at, s.submitted_at) AS marked_at, 1 AS pri
    FROM submissions s JOIN assessments a ON a.id = s.assessment_id
    WHERE s.status = 'graded' AND s.score IS NOT NULL
    UNION ALL
    SELECT r.student_id, r.assessment_id, r.score::numeric, a.total_marks, a.title, a.course_id, r.created_at, 2
    FROM results r JOIN assessments a ON a.id = r.assessment_id
  ) m ORDER BY student_id, assessment_id, pri
) marks`;

const studentAccess = (req) => {
  if (['parent', 'teacher'].includes(req.user.role)) return { code: 403, error: 'Access denied' };
  return canSeeStudent(req.user, req.params.id, ['school_admin']);
};

const userAccess = async (req, role) => {
  const target = await getUser(req.params.id);
  if (!target || target.role !== role) return { code: 404, error: role === 'parent' ? 'Parent not found' : 'Teacher not found' };
  const u = req.user;
  if (u.role === 'super_admin') return { target };
  if (u.role === role && Number(u.id) === Number(target.id)) return { target };
  if (u.role === 'school_admin' && sameSchool(u, target.school_id)) return { target };
  return { code: 403, error: 'Access denied' };
};

const gradesFor = (sid) => safe(async () => {
  const rows = await q(
    `SELECT marks.assessment_id, marks.assessment_title, marks.score, marks.total_marks, marks.marked_at, c.title AS course_title
     FROM ${MARKS} JOIN courses c ON c.id = marks.course_id
     WHERE marks.student_id = $1 ORDER BY marks.marked_at DESC NULLS LAST LIMIT 5`, [sid]);
  return rows.map((r) => ({ ...r, score: num(r.score), percent: pctOf(r.score, r.total_marks) }));
}, []);

const upcomingFor = (sid) => safe(() => q(
  `SELECT a.id, a.title, a.type, a.due_date, c.title AS course_title,
          EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id AND s.student_id = $1) AS submitted
   FROM assessments a JOIN courses c ON c.id = a.course_id
   JOIN enrollments e ON e.course_id = c.id AND e.student_id = $1
   WHERE a.type IN ('assignment', 'quiz') AND a.due_date IS NOT NULL AND a.due_date >= NOW()
   ORDER BY a.due_date ASC LIMIT 8`, [sid]), []);

const student = async (req, res) => {
  try {
    const access = await studentAccess(req);
    if (access.error) return res.status(access.code).json({ error: access.error });
    const sid = access.student.id;
    const school = access.student.school_id;

    const profile = await safe(async () => (await q(`SELECT id, full_name, avatar_url, school_id FROM users WHERE id = $1`, [sid]))[0] || null, null);
    const courses = await safe(async () => {
      const rows = await q(
        `SELECT c.id, c.title,
           (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id)::int AS total_lessons,
           (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
             WHERE lp.student_id = $1 AND l.course_id = c.id AND lp.completed = true)::int AS completed_lessons
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.student_id = $1 ORDER BY e.enrolled_at DESC`, [sid]);
      return rows.map((r) => ({ ...r, percent: r.total_lessons > 0 ? Math.round((r.completed_lessons / r.total_lessons) * 100) : 0 }));
    }, []);
    const upcoming = await upcomingFor(sid);
    const counts = await safe(async () => (await q(
      `SELECT
         COUNT(*) FILTER (WHERE a.type = 'assignment' AND a.due_date >= NOW() AND a.due_date < NOW() + interval '7 days')::int AS assignments_due_week,
         COUNT(*) FILTER (WHERE a.type = 'quiz' AND a.due_date >= NOW())::int AS quizzes_upcoming
       FROM assessments a JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = $1
       WHERE a.due_date IS NOT NULL`, [sid]))[0], { assignments_due_week: 0, quizzes_upcoming: 0 });
    const withLessons = courses.filter((c) => c.total_lessons > 0);
    const overall = withLessons.length ? Math.round(withLessons.reduce((s, c) => s + c.percent, 0) / withLessons.length) : null;

    const xp = await safe(async () => {
      const r = (await q(`SELECT total_xp, level, streak_days FROM gamification_points WHERE student_id = $1 ORDER BY (school_id = $2) DESC LIMIT 1`, [sid, school]))[0];
      return r ? { total_xp: Number(r.total_xp), level: Number(r.level), streak_days: Number(r.streak_days) } : { total_xp: 0, level: 1, streak_days: 0 };
    }, { total_xp: 0, level: 1, streak_days: 0 });
    const badges = await safe(() => q(
      `SELECT b.id, b.name, b.description, b.icon, sb.awarded_at FROM student_badges sb
       JOIN gamification_badges b ON b.id = sb.badge_id WHERE sb.student_id = $1 ORDER BY sb.awarded_at DESC LIMIT 4`, [sid]), []);

    res.json({
      dashboard: {
        profile,
        courses,
        stats: { courses: courses.length, assignments_due_week: counts.assignments_due_week, quizzes_upcoming: counts.quizzes_upcoming, overall_progress: overall },
        upcoming,
        grades: await gradesFor(sid),
        xp,
        badges,
        timetable_available: false,
        links: { ai_tutor: '/student/ai-tutor' },
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const parent = async (req, res) => {
  try {
    const access = await userAccess(req, 'parent');
    if (access.error) return res.status(access.code).json({ error: access.error });
    const pid = access.target.id;
    const school = access.target.school_id;

    const parentRow = await safe(async () => (await q(`SELECT id, full_name, avatar_url FROM users WHERE id = $1`, [pid]))[0] || null, null);
    const children = await safe(() => q(
      `SELECT u.id, u.full_name, u.avatar_url FROM parent_student ps JOIN users u ON u.id = ps.student_id
       WHERE ps.parent_id = $1 ORDER BY u.full_name`, [pid]), []);

    let selected = null;
    if (req.query.child !== undefined && req.query.child !== '') {
      selected = children.find((c) => String(c.id) === String(req.query.child)) || null;
      if (!selected) return res.status(403).json({ error: 'Not your child' });
    } else {
      selected = children[0] || null;
    }

    let child = null;
    if (selected) {
      const sid = selected.id;
      const week = await safe(() => q(
        `SELECT g.d::date::text AS date, TO_CHAR(g.d, 'FMDy') AS day,
                (SELECT a.status FROM attendance a WHERE a.student_id = $1 AND a.date = g.d::date ORDER BY a.id DESC LIMIT 1) AS status
         FROM generate_series(
           date_trunc('week', ${LAGOS_DATE}::timestamp),
           date_trunc('week', ${LAGOS_DATE}::timestamp) + interval '4 days',
           interval '1 day') AS g(d)`, [sid]), []);
      const rate = await safe(async () => {
        const r = (await q(
          `SELECT COUNT(*) FILTER (WHERE LOWER(status) IN ('present', 'late'))::int AS attended, COUNT(*)::int AS total
           FROM attendance WHERE student_id = $1 AND date >= ${LAGOS_DATE} - 30`, [sid]))[0];
        return r && r.total > 0 ? Math.round((r.attended / r.total) * 100) : null;
      }, null);
      const avg = await safe(async () => {
        const r = (await q(`SELECT AVG(score / NULLIF(total_marks, 0) * 100) AS avg FROM ${MARKS} WHERE marks.student_id = $1`, [sid]))[0];
        return r && r.avg !== null ? Math.round(Number(r.avg) * 10) / 10 : null;
      }, null);
      const fees = await safe(async () => {
        const rows = await q(
          `SELECT id, description, amount, due_date, status FROM fees
           WHERE student_id = $1 AND COALESCE(status, '') <> 'paid' ORDER BY due_date ASC NULLS LAST`, [sid]);
        return {
          outstanding_total: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
          outstanding_count: rows.length,
          items: rows.slice(0, 3).map((r) => ({ ...r, amount: Number(r.amount) })),
        };
      }, { outstanding_total: 0, outstanding_count: 0, items: [] });
      const assignments = await safe(() => q(
        `SELECT a.id, a.title, a.due_date, c.title AS course_title,
                EXISTS (SELECT 1 FROM submissions s WHERE s.assessment_id = a.id AND s.student_id = $1) AS submitted
         FROM assessments a JOIN courses c ON c.id = a.course_id
         JOIN enrollments e ON e.course_id = c.id AND e.student_id = $1
         WHERE a.type = 'assignment' ORDER BY COALESCE(a.due_date, a.created_at) DESC LIMIT 5`, [sid]), []);
      child = {
        attendance: { week, rate },
        grades: { recent: await gradesFor(sid), average_percent: avg },
        fees,
        upcoming: (await upcomingFor(sid)).slice(0, 5),
        recent_assignments: assignments,
      };
    }

    const announcements = await safe(() => q(
      `SELECT a.id, a.title, a.body, a.created_at, u.full_name AS author_name
       FROM announcements a LEFT JOIN users u ON u.id = a.created_by
       WHERE a.school_id = $1
         AND (a.target_role IN ('all', 'parent')
              OR ($2::int IS NOT NULL AND a.course_id IN (SELECT course_id FROM enrollments WHERE student_id = $2)))
       ORDER BY a.created_at DESC LIMIT 5`, [school, selected ? selected.id : null]), []);

    res.json({
      dashboard: {
        parent: parentRow,
        children,
        selected_child: selected,
        child,
        announcements,
        links: { fees: '/parent/fees', messages: '/dashboard/messages' },
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const teacher = async (req, res) => {
  try {
    const access = await userAccess(req, 'teacher');
    if (access.error) return res.status(access.code).json({ error: access.error });
    const tid = access.target.id;

    const teacherRow = await safe(async () => (await q(`SELECT id, full_name, avatar_url FROM users WHERE id = $1`, [tid]))[0] || null, null);
    const courses = await safe(async () => {
      const rows = await q(
        `SELECT c.id, c.title,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)::int AS students,
           (SELECT AVG(score / NULLIF(total_marks, 0) * 100) FROM ${MARKS} WHERE marks.course_id = c.id) AS average_percent,
           (SELECT COUNT(*) FROM submissions s JOIN assessments a ON a.id = s.assessment_id
             WHERE a.course_id = c.id AND s.status IS DISTINCT FROM 'graded')::int AS pending
         FROM courses c
         WHERE c.teacher_id = $1 OR c.id IN (SELECT course_id FROM course_assignments WHERE teacher_id = $1)
         ORDER BY c.title`, [tid]);
      return rows.map((r) => ({ ...r, average_percent: r.average_percent === null ? null : Math.round(Number(r.average_percent) * 10) / 10 }));
    }, []);
    const courseIds = courses.map((c) => c.id);

    const classes = await safe(() => q(
      `SELECT cl.id, cl.name, cl.grade_level, COUNT(*)::int AS lessons_per_week
       FROM timetable t JOIN classes cl ON cl.id = t.class_id
       WHERE t.teacher_id = $1 GROUP BY cl.id, cl.name, cl.grade_level ORDER BY cl.name`, [tid]), []);
    const today = await safe(() => q(
      `SELECT t.id, t.start_time::text AS start_time, t.end_time::text AS end_time, c.title AS course_title, cl.name AS class_name,
              CASE WHEN ${LAGOS_TIME} >= t.end_time THEN 'done' WHEN ${LAGOS_TIME} >= t.start_time THEN 'now' ELSE 'next' END AS state
       FROM timetable t JOIN courses c ON c.id = t.course_id JOIN classes cl ON cl.id = t.class_id
       WHERE t.teacher_id = $1 AND t.day_of_week = ${LAGOS_DAY} ORDER BY t.start_time`, [tid]), []);
    const students = await safe(async () => (await q(
      `SELECT COUNT(DISTINCT student_id)::int AS n FROM enrollments WHERE course_id = ANY($1::int[])`, [courseIds]))[0].n, 0);
    const pendingCount = courses.reduce((s, c) => s + c.pending, 0);
    const recent = await safe(() => q(
      `SELECT s.id, s.status, s.submitted_at, s.score, u.full_name AS student_name, a.title AS assessment_title, c.title AS course_title
       FROM submissions s JOIN assessments a ON a.id = s.assessment_id JOIN courses c ON c.id = a.course_id JOIN users u ON u.id = s.student_id
       WHERE c.id = ANY($1::int[]) ORDER BY s.submitted_at DESC NULLS LAST LIMIT 6`, [courseIds]), []);
    const distribution = await safe(async () => {
      const r = (await q(
        `SELECT COUNT(*) FILTER (WHERE p >= 80)::int AS excellent,
                COUNT(*) FILTER (WHERE p >= 60 AND p < 80)::int AS good,
                COUNT(*) FILTER (WHERE p >= 40 AND p < 60)::int AS average,
                COUNT(*) FILTER (WHERE p < 40)::int AS poor
         FROM (SELECT score / NULLIF(total_marks, 0) * 100 AS p FROM ${MARKS} WHERE marks.course_id = ANY($1::int[])) x
         WHERE p IS NOT NULL`, [courseIds]))[0];
      return r;
    }, { excellent: 0, good: 0, average: 0, poor: 0 });
    const attendanceRate = await safe(async () => {
      const r = (await q(
        `SELECT COUNT(*) FILTER (WHERE LOWER(status) IN ('present', 'late'))::int AS attended, COUNT(*)::int AS total
         FROM attendance WHERE class_id = ANY($1::int[]) AND date >= ${LAGOS_DATE} - 7`, [classes.map((c) => c.id)]))[0];
      return r && r.total > 0 ? Math.round((r.attended / r.total) * 100) : null;
    }, null);

    res.json({
      dashboard: {
        teacher: teacherRow,
        stats: { classes: classes.length, courses: courses.length, students, pending_grading: pendingCount, lessons_today: today.length, attendance_rate: attendanceRate },
        courses,
        classes,
        today,
        recent_submissions: recent,
        distribution,
        links: { grading: '/teacher/assessments', ai_tools: '/teacher/ai-tools' },
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { student, parent, teacher };
