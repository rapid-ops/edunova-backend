const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { generate, list } = require('../controllers/transcript.controller');
router.post('/generate', protect, generate);
router.get('/student/:student_id', protect, list);
module.exports = router;

// GET /api/transcripts/pdf/:student_id
const PDFDocument = require('pdfkit');
const pool2 = require('../config/db');
router.get('/pdf/:student_id', protect, async (req, res) => {
  try {
    const { student_id } = req.params;
    const tRes = await pool2.query(
      `SELECT t.*, u.full_name, s.name as school_name
       FROM transcripts t JOIN users u ON u.id=t.student_id JOIN schools s ON s.id=t.school_id
       WHERE t.student_id=$1 ORDER BY t.generated_at DESC LIMIT 1`, [student_id]);
    const transcript = tRes.rows[0];
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
    const entriesRes = await pool2.query(
      `SELECT * FROM transcript_entries WHERE transcript_id=$1 ORDER BY course_title`, [transcript.id]);
    const entries = entriesRes.rows;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => res.json({ pdf: Buffer.concat(chunks).toString('base64'), filename: `transcript-${student_id}.pdf` }));

    doc.fontSize(20).font('Helvetica-Bold').text(transcript.school_name, { align: 'center' });
    doc.moveDown(0.5).fontSize(15).text('OFFICIAL TRANSCRIPT', { align: 'center' });
    doc.moveDown(0.5).fontSize(11).font('Helvetica')
      .text(`Student: ${transcript.full_name}`)
      .text(`GPA: ${transcript.gpa}`)
      .text(`CGPA: ${transcript.cgpa}`)
      .text(`Total Credits: ${transcript.total_credits}`)
      .text(`Generated: ${new Date(transcript.generated_at).toLocaleDateString()}`);
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text('Course Records');
    doc.moveDown(0.3).fontSize(10).font('Helvetica');
    entries.forEach(e => {
      const y = doc.y;
      doc.text(e.course_title, 50, y, { width: 230 })
         .text(`${e.credits} cr`, 290, y, { width: 60 })
         .text(`${e.score ?? '-'}`, 360, y, { width: 60 })
         .text(e.letter_grade || '-', 430, y, { width: 50 })
         .text(`${e.grade_points ?? '-'} GP`, 490, y, { width: 60 });
      doc.moveDown(0.5);
    });
    doc.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});
