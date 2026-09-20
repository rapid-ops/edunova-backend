const router = require('express').Router();
const PDFDocument = require('pdfkit');
const pool = require('../config/db');
const { protect, authorize } = require('../middleware/auth.middleware');

router.get('/:student_id/:term', protect, authorize('super_admin','school_admin','teacher','student','parent'), async (req, res) => {
  const { student_id, term } = req.params;

  try {
    const [studentRes, resultsRes, attendanceRes, feesRes] = await Promise.all([
      pool.query(`SELECT u.*, s.name as school_name FROM users u LEFT JOIN schools s ON u.school_id=s.id WHERE u.id=$1`, [student_id]),
      pool.query(
        `SELECT r.*, a.title as assessment_title, a.type, a.total_marks, c.title as course_title
         FROM results r
         JOIN assessments a ON r.assessment_id=a.id
         JOIN courses c ON a.course_id=c.id
         WHERE r.student_id=$1`,
        [student_id]
      ),
      pool.query(
        `SELECT 
          COUNT(*) FILTER (WHERE status='present') as present,
          COUNT(*) FILTER (WHERE status='absent') as absent,
          COUNT(*) FILTER (WHERE status='late') as late,
          COUNT(*) as total
         FROM attendance WHERE student_id=$1`,
        [student_id]
      ),
      pool.query(`SELECT * FROM fees WHERE student_id=$1`, [student_id]),
    ]);

    const student = studentRes.rows[0];
    const results = resultsRes.rows;
    const attendance = attendanceRes.rows[0];
    const fees = feesRes.rows;

    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-card-${student.full_name}-${term}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(student.school_name || 'Edunova School', { align: 'center' });
    doc.fontSize(14).font('Helvetica').text('Student Report Card', { align: 'center' });
    doc.fontSize(12).text(`Term: ${term}`, { align: 'center' });
    doc.moveDown();

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Student Info
    doc.fontSize(12).font('Helvetica-Bold').text('Student Information');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${student.full_name}`);
    doc.text(`Email: ${student.email}`);
    doc.text(`Role: ${student.role}`);
    doc.moveDown();

    // Academic Results
    doc.fontSize(12).font('Helvetica-Bold').text('Academic Results');
    doc.moveDown(0.5);

    if (results.length === 0) {
      doc.fontSize(10).font('Helvetica').text('No results recorded yet.');
    } else {
      // Table header
      const tableTop = doc.y;
      const col = { subject: 50, assessment: 200, score: 350, total: 420, grade: 490 };

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Subject', col.subject, tableTop);
      doc.text('Assessment', col.assessment, tableTop);
      doc.text('Score', col.score, tableTop);
      doc.text('Total', col.total, tableTop);
      doc.text('Grade', col.grade, tableTop);
      doc.moveDown(0.5);

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      let totalScore = 0;
      let totalPossible = 0;

      results.forEach((r) => {
        const y = doc.y;
        const pct = (r.score / r.total_marks) * 100;
        const grade = pct >= 70 ? 'A' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : pct >= 45 ? 'D' : 'F';

        doc.fontSize(9).font('Helvetica');
        doc.text(r.course_title?.substring(0, 20) || '-', col.subject, y);
        doc.text(r.assessment_title?.substring(0, 20) || '-', col.assessment, y);
        doc.text(String(r.score), col.score, y);
        doc.text(String(r.total_marks), col.total, y);
        doc.text(grade, col.grade, y);
        doc.moveDown(0.5);

        totalScore += Number(r.score);
        totalPossible += Number(r.total_marks);
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);

      const overallPct = totalPossible > 0 ? ((totalScore / totalPossible) * 100).toFixed(1) : 0;
      const overallGrade = Number(overallPct) >= 70 ? 'A' : Number(overallPct) >= 60 ? 'B' : Number(overallPct) >= 50 ? 'C' : Number(overallPct) >= 45 ? 'D' : 'F';

      doc.fontSize(11).font('Helvetica-Bold').text(`Overall: ${overallPct}% — Grade ${overallGrade}`);
    }

    doc.moveDown();

    // Attendance
    doc.fontSize(12).font('Helvetica-Bold').text('Attendance Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Present: ${attendance.present} days`);
    doc.text(`Absent: ${attendance.absent} days`);
    doc.text(`Late: ${attendance.late} days`);
    doc.text(`Total: ${attendance.total} days`);
    doc.moveDown();

    // Fees
    doc.fontSize(12).font('Helvetica-Bold').text('Fee Status');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    const unpaidFees = fees.filter((f) => f.status !== 'paid');
    if (unpaidFees.length === 0) {
      doc.text('All fees cleared.');
    } else {
      unpaidFees.forEach((f) => {
        doc.text(`${f.description}: ₦${Number(f.amount).toLocaleString()} — ${f.status}`);
      });
    }

    doc.moveDown(2);

    // Footer
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').text(`Generated by Edunova on ${new Date().toLocaleDateString()}`, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
