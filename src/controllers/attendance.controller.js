const { markAttendance, getAttendanceByClass, getAttendanceByStudent } = require('../models/attendance.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass } = require('../utils/access');
const { sendWhatsApp } = require('../services/whatsapp.service');
const pool = require('../config/db');

const STAFF = ['super_admin', 'school_admin', 'teacher'];

const mark = async (req, res) => {
  try {
    const { student_id, class_id, date, status } = req.body;
    if (!validId(student_id) || !validId(class_id) || !date || !status)
      return res.status(400).json({ error: 'student_id, class_id, date and status required' });
    if (Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
    if (typeof status !== 'string' || status.length > 20) return res.status(400).json({ error: 'Invalid status' });
    const cls = await getClass(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(cls.school_id))
      return res.status(404).json({ error: 'Student not found in this school' });
    const record = await markAttendance({ school_id: cls.school_id, student_id: st.id, class_id: cls.id, date, status });
    if (status.toLowerCase() === 'absent') {
      try {
        const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [cls.school_id]);
        const schoolName = schoolRes.rows[0]?.name || 'School';
        const parentRes = await pool.query(
          `SELECT u.phone, u.full_name FROM users u JOIN parent_student sp ON sp.parent_id=u.id WHERE sp.student_id=$1 LIMIT 1`,
          [st.id]
        );
        if (parentRes.rows[0]?.phone) {
          const fd = new Date(date).toLocaleDateString('en-NG');
          sendWhatsApp(parentRes.rows[0].phone,
            `📋 Attendance Alert\n${st.full_name} was marked ABSENT today ${fd} at ${schoolName}. Please contact the school if this is incorrect.`);
        }
        const rateRes = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE status='present') AS present, COUNT(*) AS total
           FROM attendance WHERE student_id=$1 AND school_id=$2`, [st.id, cls.school_id]);
        const { present, total } = rateRes.rows[0];
        if (Number(total) >= 10) {
          const rate = Math.round((Number(present) / Number(total)) * 100);
          if (rate < 75 && parentRes.rows[0]?.phone)
            sendWhatsApp(parentRes.rows[0].phone,
              `⚠️ Attendance Warning\nDear ${parentRes.rows[0].full_name}, ${st.full_name}'s attendance has dropped below 75%. Current rate: ${rate}%. Please ensure regular attendance.`);
        }
      } catch (e) { console.error('WhatsApp attendance error:', e.message); }
    }
    res.status(201).json({ record });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const byClass = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const cls = await getClass(req.params.class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ records: await getAttendanceByClass(cls.id, req.query.date) });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const byStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ records: await getAttendanceByStudent(access.student.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const bulkMark = async (req, res) => {
  try {
    const { class_id, date, records } = req.body;
    if (!validId(class_id) || !date || !Array.isArray(records) || !records.length)
      return res.status(400).json({ error: 'class_id, date and records required' });
    if (Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
    const cls = await getClass(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const client = await pool.connect();
    const saved = [];
    try {
      await client.query('BEGIN');
      for (const r of records) {
        if (!validId(r.student_id) || typeof r.status !== 'string' || r.status.length > 20) continue;
        const row = await client.query(
          `INSERT INTO attendance (school_id,student_id,class_id,date,status)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,
          [cls.school_id, r.student_id, cls.id, date, r.status]);
        if (row.rows[0]) saved.push(row.rows[0]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
    const absent = records.filter(r => r.status.toLowerCase() === 'absent');
    if (absent.length) {
      try {
        const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [cls.school_id]);
        const sn = schoolRes.rows[0]?.name || 'School';
        const fd = new Date(date).toLocaleDateString('en-NG');
        for (const r of absent) {
          const stRes = await pool.query('SELECT full_name FROM users WHERE id=$1', [r.student_id]);
          if (!stRes.rows[0]) continue;
          const pRes = await pool.query(
            `SELECT u.phone FROM users u JOIN parent_student sp ON sp.parent_id=u.id WHERE sp.student_id=$1 LIMIT 1`,
            [r.student_id]);
          if (pRes.rows[0]?.phone)
            sendWhatsApp(pRes.rows[0].phone,
              `📋 Attendance Alert\n${stRes.rows[0].full_name} was marked ABSENT today ${fd} at ${sn}. Please contact the school if this is incorrect.`);
        }
      } catch (e) { console.error('WhatsApp bulk error:', e.message); }
    }
    res.status(201).json({ records: saved, count: saved.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const analytics = async (req, res) => {
  try {
    const { school_id } = req.params;
    if (!validId(school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, school_id)) return res.status(403).json({ error: 'Access denied' });
    const [perStudent, perClass, overall] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name,
           COUNT(*) FILTER (WHERE a.status='present') AS present, COUNT(*) AS total,
           ROUND(COUNT(*) FILTER (WHERE a.status='present')*100.0/NULLIF(COUNT(*),0),1) AS rate
         FROM users u LEFT JOIN attendance a ON a.student_id=u.id AND a.school_id=$1
         WHERE u.school_id=$1 AND u.role='student'
         GROUP BY u.id,u.full_name ORDER BY rate ASC NULLS LAST`, [school_id]),
      pool.query(
        `SELECT c.id, c.name,
           COUNT(*) FILTER (WHERE a.status='present') AS present, COUNT(*) AS total,
           ROUND(COUNT(*) FILTER (WHERE a.status='present')*100.0/NULLIF(COUNT(*),0),1) AS rate
         FROM classes c LEFT JOIN attendance a ON a.class_id=c.id AND a.school_id=$1
         WHERE c.school_id=$1 GROUP BY c.id,c.name ORDER BY c.name`, [school_id]),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status='present') AS present, COUNT(*) AS total,
           ROUND(COUNT(*) FILTER (WHERE status='present')*100.0/NULLIF(COUNT(*),0),1) AS rate
         FROM attendance WHERE school_id=$1`, [school_id]),
    ]);
    res.json({ per_student: perStudent.rows, per_class: perClass.rows, overall: overall.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { mark, byClass, byStudent, bulkMark, analytics };
