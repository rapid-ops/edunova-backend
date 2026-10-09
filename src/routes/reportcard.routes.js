const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { protect } = require('../middleware/auth.middleware');

function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v-20)%10] || s[v] || s[0];
}

router.get('/:student_id/:school_id', protect, async (req, res) => {
  try {
    const { student_id, school_id } = req.params;

    const studentRes = await pool.query(
      `SELECT u.full_name, u.id,
              c.name as class_name,
              s.name as school_name,
              s.address as school_address
       FROM users u
       LEFT JOIN class_enrollments ce ON ce.student_id = u.id
       LEFT JOIN classes c ON c.id = ce.class_id
       JOIN schools s ON s.id = $2
       WHERE u.id = $1 LIMIT 1`,
      [student_id, school_id]
    );
    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const resultsRes = await pool.query(
      `SELECT
         co.title as subject_name,
         ROUND(AVG(g.score) FILTER (WHERE a.type='assignment'), 1) as ca_score,
         ROUND(AVG(g.score) FILTER (WHERE a.type='exam'), 1) as exam_score,
         ROUND(AVG(g.score), 1) as total_score
       FROM gradebook g
       JOIN assessments a ON a.id = g.assessment_id
       JOIN courses co ON co.id = a.course_id
       WHERE g.student_id=$1 AND g.school_id=$2
       GROUP BY co.id, co.title
       ORDER BY co.title`,
      [student_id, school_id]
    );

    const attRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='present') as present,
         COUNT(*) FILTER (WHERE status='absent') as absent,
         COUNT(*) as total
       FROM attendance WHERE student_id=$1 AND school_id=$2`,
      [student_id, school_id]
    );
    const att = attRes.rows[0];
    const present = Number(att.present);
    const total = Number(att.total);
    const percentage = total > 0 ? Math.round((present/total)*100) : 0;

    const posRes = await pool.query(
      `SELECT student_id, RANK() OVER (ORDER BY AVG(score) DESC) as position
       FROM gradebook WHERE school_id=$1 GROUP BY student_id`,
      [school_id]
    );
    const myPos = posRes.rows.find(r => String(r.student_id) === String(student_id));

    const teacherRes = await pool.query(
      `SELECT u.full_name FROM users u
       JOIN classes c ON c.teacher_id = u.id
       JOIN class_enrollments ce ON ce.class_id = c.id
       WHERE ce.student_id=$1 LIMIT 1`,
      [student_id]
    );

    res.json({
      student_name: student.full_name,
      class_name: student.class_name,
      school_name: student.school_name,
      school_address: student.school_address,
      academic_year: '2025/2026',
      results: resultsRes.rows,
      attendance: { present, absent: Number(att.absent), total, percentage },
      position: myPos ? `${myPos.position}${ordinal(Number(myPos.position))}` : '-',
      teacher_name: teacherRes.rows[0]?.full_name || null,
      teacher_comment: 'Keep up the good work!',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// POST /api/reportcards/generate — pdfkit PDF, returns base64
router.post('/generate', protect, async (req, res) => {
  try {
    const { student_id, school_id, term } = req.body;
    if (!student_id || !school_id) return res.status(400).json({ error: 'student_id and school_id required' });

    const [studentRes, resultsRes, attRes] = await Promise.all([
      pool.query(
        `SELECT u.full_name, s.name as school_name, s.address as school_address,
                c.name as class_name
         FROM users u JOIN schools s ON s.id=$2
         LEFT JOIN class_enrollments ce ON ce.student_id=u.id
         LEFT JOIN classes c ON c.id=ce.class_id
         WHERE u.id=$1 LIMIT 1`, [student_id, school_id]),
      pool.query(
        `SELECT co.title as subject,
                ROUND(AVG(g.score) FILTER (WHERE a.type='assignment'),1) as ca,
                ROUND(AVG(g.score) FILTER (WHERE a.type='exam'),1) as exam,
                ROUND(AVG(g.score),1) as total
         FROM gradebook g JOIN assessments a ON a.id=g.assessment_id
         JOIN courses co ON co.id=a.course_id
         WHERE g.student_id=$1 AND g.school_id=$2
         GROUP BY co.id,co.title ORDER BY co.title`, [student_id, school_id]),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status='present') AS present,
                COUNT(*) FILTER (WHERE status='absent') AS absent,
                COUNT(*) AS total
         FROM attendance WHERE student_id=$1 AND school_id=$2`, [student_id, school_id]),
    ]);

    const student = studentRes.rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const results = resultsRes.rows;
    const att = attRes.rows[0];
    const attPct = Number(att.total) > 0
      ? Math.round((Number(att.present) / Number(att.total)) * 100) : 0;

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      res.json({ pdf: Buffer.concat(chunks).toString('base64'), filename: `report-card-${student_id}.pdf` });
    });

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text(student.school_name, { align: 'center' });
    doc.fontSize(11).font('Helvetica').text(student.school_address || '', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').text('STUDENT REPORT CARD', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica')
      .text(`Student: ${student.full_name}`, 50)
      .text(`Class: ${student.class_name || '-'}`)
      .text(`Term: ${term || 'Current'}`)
      .text(`Academic Year: 2025/2026`);
    doc.moveDown();

    // Results table
    doc.fontSize(13).font('Helvetica-Bold').text('Academic Results');
    doc.moveDown(0.3);
    const cols = [50, 250, 340, 430, 490];
    doc.fontSize(10).font('Helvetica-Bold')
      .text('Subject', cols[0], doc.y, { width: 180 });
    const y0 = doc.y - 12;
    doc.text('CA', cols[1], y0, { width: 80 })
       .text('Exam', cols[2], y0, { width: 80 })
       .text('Total', cols[3], y0, { width: 60 });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);
    results.forEach(r => {
      const y = doc.y;
      doc.text(r.subject, cols[0], y, { width: 190 })
         .text(r.ca ?? '-', cols[1], y, { width: 80 })
         .text(r.exam ?? '-', cols[2], y, { width: 80 })
         .text(r.total ?? '-', cols[3], y, { width: 60 });
      doc.moveDown(0.4);
    });
    if (!results.length) doc.text('No results recorded yet.');
    doc.moveDown();

    // Attendance
    doc.fontSize(13).font('Helvetica-Bold').text('Attendance Summary');
    doc.moveDown(0.3).fontSize(10).font('Helvetica')
      .text(`Days Present: ${att.present}`)
      .text(`Days Absent: ${att.absent}`)
      .text(`Attendance Rate: ${attPct}%`);
    doc.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});
