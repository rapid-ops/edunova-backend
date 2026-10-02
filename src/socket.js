const jwt = require('jsonwebtoken');
const pool = require('./config/db');

const verify = (token) => {
  try { return jwt.verify(String(token || ''), process.env.JWT_SECRET); } catch { return null; }
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    // Joins the logged-in user's own room only. The id sent by the browser is ignored.
    socket.on('join', (_userId, token) => {
      const user = verify(token);
      if (!user) return;
      const mine = `user_${user.id}`;
      for (const room of socket.rooms) {
        if (room.startsWith('user_') && room !== mine) socket.leave(room);
      }
      socket.join(mine);
    });

    socket.on('send_message', async (data) => {
      try {
        const user = verify(data && data.token);
        if (!user) return;
        const receiverId = data && data.receiver_id;
        const content = typeof (data && data.content) === 'string' ? data.content.trim() : '';
        if (!/^\d+$/.test(String(receiverId)) || !content || content.length > 2000) return;
        const r = await pool.query(`SELECT id, school_id FROM users WHERE id=$1`, [receiverId]);
        const receiver = r.rows[0];
        if (!receiver) return;
        if (user.role !== 'super_admin' && (user.school_id == null || Number(receiver.school_id) !== Number(user.school_id))) return;
        const result = await pool.query(
          `INSERT INTO messages (school_id, sender_id, receiver_id, content)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [receiver.school_id, user.id, receiver.id, content]
        );
        const message = result.rows[0];
        io.to(`user_${receiver.id}`).emit('new_message', message);
        io.to(`user_${user.id}`).emit('new_message', message);
      } catch (err) {
        console.error('Message error:', err.message);
      }
    });

    socket.on('disconnect', () => {});
  });
};
