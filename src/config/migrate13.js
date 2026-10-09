const pool = require('./db');
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gamification_points (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        points INTEGER DEFAULT 0,
        total_xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        streak_days INTEGER DEFAULT 0,
        last_activity_date DATE,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, school_id)
      );
      CREATE TABLE IF NOT EXISTS gamification_badges (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        condition_type VARCHAR(50),
        condition_value INTEGER
      );
      CREATE TABLE IF NOT EXISTS student_badges (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        badge_id INTEGER REFERENCES gamification_badges(id) ON DELETE CASCADE,
        awarded_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, badge_id)
      );
      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        period VARCHAR(20) DEFAULT 'all_time',
        points INTEGER DEFAULT 0,
        rank INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(school_id, student_id, period)
      );
    `);
    console.log('migrate13 done');
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
