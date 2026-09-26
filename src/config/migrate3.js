const pool = require('./db');
const migrate3 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_paths (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS learning_path_courses (
        id SERIAL PRIMARY KEY,
        path_id INTEGER REFERENCES learning_paths(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        position INTEGER DEFAULT 0,
        UNIQUE(path_id, course_id)
      );
      CREATE TABLE IF NOT EXISTS gradebook (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        score NUMERIC(5,2),
        weight NUMERIC(5,2) DEFAULT 1,
        letter_grade VARCHAR(5),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, assessment_id)
      );
      CREATE TABLE IF NOT EXISTS discussions (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        upvotes INTEGER DEFAULT 0,
        is_pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS discussion_upvotes (
        id SERIAL PRIMARY KEY,
        discussion_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(discussion_id, user_id)
      );
      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS drip_days INTEGER DEFAULT 0;
      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
      ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP DEFAULT NOW();
    `);
    console.log('Migration 3 complete');
  } catch (err) { console.error('Migration 3 error:', err.message); }
  finally { process.exit(); }
};
migrate3();
