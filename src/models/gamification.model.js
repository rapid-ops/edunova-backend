const pool = require('../config/db');

const awardPoints = async (student_id, school_id, points) => {
  const r = await pool.query(`
    INSERT INTO gamification_points (student_id, school_id, points, total_xp, last_activity_date)
    VALUES ($1, $2, $3, $3, CURRENT_DATE)
    ON CONFLICT (student_id, school_id) DO UPDATE SET
      points = gamification_points.points + $3,
      total_xp = gamification_points.total_xp + $3,
      level = FLOOR((gamification_points.total_xp + $3) / 100) + 1,
      streak_days = CASE
        WHEN gamification_points.last_activity_date = CURRENT_DATE - 1
          THEN gamification_points.streak_days + 1
        WHEN gamification_points.last_activity_date = CURRENT_DATE
          THEN gamification_points.streak_days
        ELSE 1
      END,
      last_activity_date = CURRENT_DATE,
      updated_at = NOW()
    RETURNING *
  `, [student_id, school_id, points]);
  const profile = r.rows[0];
  await checkAndAwardBadges(student_id, school_id);
  await updateLeaderboard(school_id);
  return profile;
};

const getProfile = async (student_id) => {
  const [pr, br] = await Promise.all([
    pool.query(`SELECT * FROM gamification_points WHERE student_id=$1`, [student_id]),
    pool.query(`
      SELECT b.*, sb.awarded_at FROM student_badges sb
      JOIN gamification_badges b ON b.id = sb.badge_id
      WHERE sb.student_id=$1 ORDER BY sb.awarded_at DESC LIMIT 10
    `, [student_id])
  ]);
  return {
    ...(pr.rows[0] || { points: 0, total_xp: 0, level: 1, streak_days: 0 }),
    badges: br.rows
  };
};

const getLeaderboard = async (school_id, period = 'all_time') => {
  const valid = ['weekly', 'monthly', 'all_time'];
  if (!valid.includes(period)) period = 'all_time';
  if (period !== 'all_time') {
    const days = period === 'weekly' ? 7 : 30;
    const r = await pool.query(`
      SELECT lp.student_id, u.full_name, u.avatar_url,
        (COUNT(*) * 10)::int AS points,
        RANK() OVER (ORDER BY COUNT(*) DESC)::int AS rank
      FROM lesson_progress lp
      JOIN users u ON u.id = lp.student_id
      WHERE lp.completed = true
        AND lp.last_watched_at >= NOW() - make_interval(days => $2)
        AND u.school_id = $1
      GROUP BY lp.student_id, u.full_name, u.avatar_url
      ORDER BY points DESC LIMIT 20
    `, [school_id, days]);
    return r.rows;
  }
  const r = await pool.query(`
    SELECT gp.student_id, gp.points, gp.level, u.full_name, u.avatar_url,
      RANK() OVER (ORDER BY gp.points DESC)::int AS rank
    FROM gamification_points gp
    JOIN users u ON u.id = gp.student_id
    WHERE gp.school_id = $1
    ORDER BY gp.points DESC LIMIT 20
  `, [school_id]);
  return r.rows;
};

const checkAndAwardBadges = async (student_id, school_id) => {
  const [pr, br, lr] = await Promise.all([
    pool.query(`SELECT * FROM gamification_points WHERE student_id=$1 AND school_id=$2`, [student_id, school_id]),
    pool.query(`SELECT * FROM gamification_badges WHERE school_id=$1`, [school_id]),
    pool.query(`SELECT COUNT(*) AS cnt FROM lesson_progress WHERE student_id=$1 AND completed=true`, [student_id])
  ]);
  const p = pr.rows[0];
  if (!p) return;
  const lessons = parseInt(lr.rows[0].cnt);
  for (const badge of br.rows) {
    let met = false;
    if (badge.condition_type === 'xp_earned') met = p.total_xp >= badge.condition_value;
    else if (badge.condition_type === 'streak_days') met = p.streak_days >= badge.condition_value;
    else if (badge.condition_type === 'lessons_complete') met = lessons >= badge.condition_value;
    else if (badge.condition_type === 'level_reached') met = p.level >= badge.condition_value;
    if (met) await pool.query(
      `INSERT INTO student_badges (student_id, badge_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [student_id, badge.id]
    );
  }
};

const updateLeaderboard = async (school_id) => {
  const r = await pool.query(
    `SELECT student_id, points FROM gamification_points WHERE school_id=$1 ORDER BY points DESC`,
    [school_id]
  );
  for (let i = 0; i < r.rows.length; i++) {
    const { student_id, points } = r.rows[i];
    await pool.query(`
      INSERT INTO leaderboard_entries (school_id, student_id, period, points, rank)
      VALUES ($1,$2,'all_time',$3,$4)
      ON CONFLICT (school_id, student_id, period) DO UPDATE
      SET points=$3, rank=$4, updated_at=NOW()
    `, [school_id, student_id, points, i + 1]);
  }
};

const getBadges = async (school_id) => {
  const r = await pool.query(`SELECT * FROM gamification_badges WHERE school_id=$1 ORDER BY id`, [school_id]);
  return r.rows;
};

const createBadge = async ({ school_id, name, description, icon, condition_type, condition_value }) => {
  const r = await pool.query(
    `INSERT INTO gamification_badges (school_id,name,description,icon,condition_type,condition_value)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [school_id, name, description, icon, condition_type, condition_value]
  );
  return r.rows[0];
};

module.exports = { awardPoints, getProfile, getLeaderboard, checkAndAwardBadges, updateLeaderboard, getBadges, createBadge };
