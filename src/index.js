const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
require('./config/db');

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
