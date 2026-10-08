const pool = require('../config/db');
const track = (event_type) => async (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const student_id = req.user?.id || req.body?.student_id;
    const school_id = req.user?.school_id || req.body?.school_id;
    if (!student_id) return;
    pool.query(
      `INSERT INTO analytics_events (student_id,school_id,event_type,metadata) VALUES ($1,$2,$3,$4)`,
      [student_id, school_id, event_type, JSON.stringify({ path: req.path })]
    ).catch(() => {});
  });
  next();
};
module.exports = { track };
