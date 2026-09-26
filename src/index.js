const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
require('./config/db');
require('./config/migrate');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.set('io', io);

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/schools', require('./routes/school.routes'));
app.use('/api/classes', require('./routes/class.routes'));
app.use('/api/timetable', require('./routes/timetable.routes'));
app.use('/api/courses', require('./routes/course.routes'));
app.use('/api/lessons', require('./routes/lesson.routes'));
app.use('/api/assessments', require('./routes/assessment.routes'));
app.use('/api/enrollments', require('./routes/enrollment.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/fees', require('./routes/fee.routes'));
app.use('/api/messages', require('./routes/message.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/results', require('./routes/result.routes'));
app.use('/api/upload', require('./routes/upload.routes'));
app.use('/api/payment', require('./routes/payment.routes'));
app.use('/api/reportcard', require('./routes/reportcard.routes'));
app.use('/api/import', require('./routes/import.routes'));
app.use('/api/parent', require('./routes/parent.routes'));
app.use('/api/learning-paths', require('./routes/learningpath.routes'));
app.use('/api/gradebook', require('./routes/gradebook.routes'));
app.use('/api/discussions', require('./routes/discussion.routes'));
app.use('/api/quiz', require('./routes/quiz.routes'));
app.use('/api/progress', require('./routes/progress.routes'));
app.use('/api/certificates', require('./routes/certificate.routes'));
app.use('/api/student-classes', require('./routes/studentclass.routes'));
app.use('/api/learning-paths', require('./routes/learningpath.routes'));
app.use('/api/gradebook', require('./routes/gradebook.routes'));
app.use('/api/discussions', require('./routes/discussion.routes'));
app.use('/api/departments', require('./routes/department.routes'));
app.use('/api/programs', require('./routes/program.routes'));
app.use('/api/batches', require('./routes/batch.routes'));
app.use('/api/semesters', require('./routes/semester.routes'));
app.use('/api/tickets', require('./routes/ticket.routes'));
app.use('/api/coupons', require('./routes/coupon.routes'));
app.use('/api/audit-logs', require('./routes/auditlog.routes'));
app.use('/api/competencies', require('./routes/competency.routes'));
app.use('/api/proctoring', require('./routes/proctoring.routes'));
app.use('/api/custom-roles', require('./routes/customrole.routes'));
app.use('/api/automations', require('./routes/automation.routes'));
app.use('/api/scorm', require('./routes/scorm.routes'));
app.use('/api/transcripts', require('./routes/transcript.routes'));
app.use('/api/curriculum', require('./routes/curriculum.routes'));
app.use('/api/accreditation', require('./routes/accreditation.routes'));
app.use('/api/virtual-labs', require('./routes/virtuallab.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/transcripts', require('./routes/transcript.routes'));
app.use('/api/curriculum', require('./routes/curriculum.routes'));
app.use('/api/accreditation', require('./routes/accreditation.routes'));
app.use('/api/virtual-labs', require('./routes/virtuallab.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/ai-courses', require('./routes/aicourse.routes'));
app.use('/api/ai-tutor', require('./routes/aitutor.routes'));
app.use('/api/skill-gap', require('./routes/skillgap.routes'));
app.use('/api/adaptive', require('./routes/adaptive.routes'));
app.use('/api/blockchain', require('./routes/blockchain.routes'));
app.use('/api/career', require('./routes/career.routes'));
app.use('/api/subscription', require('./routes/subscription.routes'));

app.get('/', (req, res) => {
  res.json({ message: 'Edunova API running' });
});

io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(`user_${userId}`));
  socket.on('send_message', async (data) => {
    const { sender_id, receiver_id, school_id, content } = data;
    const pool = require('./config/db');
    try {
      const result = await pool.query(
        `INSERT INTO messages (school_id, sender_id, receiver_id, content)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [school_id, sender_id, receiver_id, content]
      );
      const message = result.rows[0];
      io.to(`user_${receiver_id}`).emit('new_message', message);
      io.to(`user_${sender_id}`).emit('new_message', message);
    } catch (err) {
      console.error('Message error:', err.message);
    }
  });
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, io };
