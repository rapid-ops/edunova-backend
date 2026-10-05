const { markAttendance, getAttendanceByClass, getAttendanceByStudent } = require('../models/attendance.model');
const { validId, sameSchool, canSeeStudent, getUser, getClass } = require('../utils/access');
const { sendWhatsApp } = require('../services/whatsapp.service');
const pool = require('../config/db');

const STAFF = ['super_admin', 'school_admin', 'teacher'];

const mark = async (req, res) => {
  try {
    const { student_id, class_id, date, status } = req.body;
    if (!validId(student_id) || !validId(class_id) || !date || !status) {
      return res.status(400).json({ error: 'student_id, class_id, date and status required' });
    }
    if (Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date' });
    if (typeof status !== 'string' || status.length > 20) return res.status(400).json({ error: 'Invalid status' });
    const cls = await getClass(class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const st = await getUser(student_id);
    if (!st || st.role !== 'student' || Number(st.school_id) !== Number(cls.school_id)) {
      return res.status(404).json({ error: 'Student not found in this school' });
    }
    const record = await markAttendance({ school_id: cls.school_id, student_id: st.id, class_id: cls.id, date, status });

    // WhatsApp alert for absent
    if (status.toLowerCase() === 'absent') {
      try {
        const schoolRes = await pool.query('SELECT name FROM schools WHERE id=$1', [cls.school_id]);
        const schoolName = schoolRes.rows[0]?.name || 'School';
        const parentRes = await pool.query(
          `SELECT u.phone, u.full_name FROM users u
           JOIN student_parents sp ON sp.parent_id = u.id
           WHERE sp.student_id = $1 LIMIT 1`,
          [st.id]
        );
        if (parentRes.rows[0]?.phone) {
          const formattedDate = new Date(date).toLocaleDateString('en-NG');
          sendWhatsApp(
            parentRes.rows[0].phone,
            `📋 Attendance Alert\n${st.full_name} was marked ABSENT today ${formattedDate} at ${schoolName}. Please contact the school if this is incorrect.`
          );
        }

        // Check attendance rate for low-attendance warning
        const rateRes = await pool.query(
          `SELECT 
            COUNT(*) FILTER (WHERE status='present') AS present,
            COUNT(*) AS total
           FROM attendance WHERE student_id=$1 AND school_id=$2`,
          [st.id, cls.school_id]
        );
        const { present, total } = rateRes.rows[0];
        if (total >= 10) {
          const rate = Math.round((Number(present) / Number(total)) * 100);
          if (rate < 75 && parentRes.rows[0]?.phone) {
            sendWhatsApp(
              parentRes.rows[0].phone,
              `⚠️ Attendance Warning\nDear ${parentRes.rows[0].full_name}, ${st.full_name}'s attendance has dropped below 75%. Current rate: ${rate}%. Please ensure regular attendance.`
            );
          }
        }
      } catch (e) {
        console.error('WhatsApp attendance error:', e.message);
      }
    }

    res.status(201).json({ record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byClass = async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    const cls = await getClass(req.params.class_id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    if (!sameSchool(req.user, cls.school_id)) return res.status(403).json({ error: 'Access denied' });
    const { date } = req.query;
    const records = await getAttendanceByClass(cls.id, date);
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const byStudent = async (req, res) => {
  try {
    const access = await canSeeStudent(req.user, req.params.student_id, ['school_admin', 'teacher']);
    if (access.error) return res.status(access.code).json({ error: access.error });
    res.json({ records: await getAttendanceByStudent(access.student.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { mark, byClass, byStudent };
