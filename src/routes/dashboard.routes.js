const router = require('express').Router();
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validId, sameSchool } = require('../utils/access');

const num = (v) => Number(v || 0);
const safe = async (name, fn) => {
  try { return await fn(); } catch (e) { console.error('dashboard ' + name + ':', e.message); return null; }
};

router.get('/school/:school_id', protect, authorize('super_admin', 'school_admin'), async (req, res) => {
  const id = req.params.school_id;
  if (!validId(id)) return res.status(404).json({ error: 'School not found' });
  if (!sameSchool(req.user, id)) return res.status(403).json({ error: 'Access denied' });
  try {
    const sid = Number(id);
    const s = await pool.query('SELECT * FROM schools WHERE id=$1', [sid]);
    if (!s.rows[0]) return res.status(404).json({ error: 'School not found' });
    const tz = s.rows[0].timezone || 'Africa/Lagos';
    const schoolName = s.rows[0].name || s.rows[0].school_name || null;
    const q = (sql, params) => pool.query(sql, params || [sid]).then((r) => r.rows);

    const [totals, attToday, attTrend, fees, feesMonthly, announcements, assessments, events, registrations, topCourses] = await Promise.all([
      safe('totals', async () => {
        const r = (await q(`SELECT
          (SELECT COUNT(*) FROM users WHERE school_id=$1 AND role='student' AND is_active=true AND approval_status='approved') AS students,
          (SELECT COUNT(*) FROM users WHERE school_id=$1 AND role='teacher' AND is_active=true AND approval_status='approved') AS teachers,
          (SELECT COUNT(*) FROM users WHERE school_id=$1 AND role='parent' AND is_active=true AND approval_status='approved') AS parents,
          (SELECT COUNT(*) FROM classes WHERE school_id=$1) AS classes,
          (SELECT COUNT(*) FROM courses WHERE school_id=$1) AS courses,
          (SELECT COUNT(*) FROM courses WHERE school_id=$1 AND is_published=true) AS published_courses,
          (SELECT COUNT(*) FROM users WHERE school_id=$1 AND approval_status='pending') AS pending_approvals,
          (SELECT COUNT(*) FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE c.school_id=$1) AS enrollments`))[0];
        return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)]));
      }),
      safe('attendance_today', async () => {
        const r = (await q(`SELECT COUNT(*) FILTER (WHERE status='present') AS present,
          COUNT(*) FILTER (WHERE status='absent') AS absent,
          COUNT(*) FILTER (WHERE status='late') AS late, COUNT(*) AS total
          FROM attendance WHERE school_id=$1 AND date = (NOW() AT TIME ZONE $2)::date`, [sid, tz]))[0];
        const total = num(r.total);
        return { present: num(r.present), absent: num(r.absent), late: num(r.late), total, rate: total ? Math.round((num(r.present) / total) * 100) : null };
      }),
      safe('attendance_trend', async () => (await q(`SELECT to_char(date,'YYYY-MM-DD') AS date,
          COUNT(*) FILTER (WHERE status='present') AS present, COUNT(*) AS total
          FROM attendance WHERE school_id=$1 AND date >= (NOW() AT TIME ZONE $2)::date - 6
          GROUP BY date ORDER BY date`, [sid, tz])).map((x) => ({ date: x.date, present: num(x.present), total: num(x.total) }))),
      safe('fees', async () => {
        const r = (await q(`SELECT COALESCE(SUM(amount),0) AS total_due,
          COALESCE(SUM(amount) FILTER (WHERE status='paid'),0) AS collected,
          COALESCE(SUM(amount) FILTER (WHERE status<>'paid'),0) AS outstanding,
          COALESCE(SUM(amount) FILTER (WHERE status='overdue' OR (status='pending' AND due_date < NOW())),0) AS overdue_amount,
          COUNT(*) AS invoices, COUNT(*) FILTER (WHERE status='paid') AS paid_count,
          COUNT(*) FILTER (WHERE status<>'paid') AS unpaid_count FROM fees WHERE school_id=$1`))[0];
        return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)]));
      }),
      safe('fees_monthly', async () => (await q(`SELECT to_char(date_trunc('month', paid_at),'YYYY-MM') AS month, SUM(amount) AS amount
          FROM fees WHERE school_id=$1 AND status='paid' AND paid_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
          GROUP BY 1 ORDER BY 1`)).map((x) => ({ month: x.month, amount: num(x.amount) }))),
      safe('announcements', () => q(`SELECT id, title, created_at FROM announcements WHERE school_id=$1 ORDER BY created_at DESC LIMIT 5`)),
      safe('upcoming_assessments', () => q(`SELECT a.id, a.title, a.type, a.due_date, c.title AS course_title
          FROM assessments a JOIN courses c ON c.id=a.course_id
          WHERE c.school_id=$1 AND a.due_date >= NOW() ORDER BY a.due_date LIMIT 5`)),
      safe('upcoming_events', () => q(`SELECT id, title, type, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date
          FROM academic_calendar WHERE school_id=$1 AND end_date >= (NOW() AT TIME ZONE $2)::date ORDER BY start_date LIMIT 5`, [sid, tz])),
      safe('recent_registrations', () => q(`SELECT id, full_name, role, created_at FROM users
          WHERE school_id=$1 AND role IN ('student','teacher') AND approval_status='approved' ORDER BY created_at DESC LIMIT 5`)),
      safe('top_courses', async () => (await q(`SELECT c.id, c.title, COUNT(e.id) AS enrolled FROM courses c
          LEFT JOIN enrollments e ON e.course_id=c.id WHERE c.school_id=$1
          GROUP BY c.id ORDER BY enrolled DESC, c.title LIMIT 5`)).map((x) => ({ id: x.id, title: x.title, enrolled: num(x.enrolled) }))),
    ]);

    res.json({
      generated_at: new Date().toISOString(), school_id: sid, timezone: tz, school_name: schoolName,
      totals, attendance_today: attToday, attendance_trend: attTrend, fees, fees_monthly: feesMonthly,
      announcements, upcoming_assessments: assessments, upcoming_events: events,
      recent_registrations: registrations, top_courses: topCourses,
    });
  } catch (err) {
    console.error('dashboard:', err.message);
    res.status(500).json({ error: 'Dashboard unavailable' });
  }
});

module.exports = router;
