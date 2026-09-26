const pool = require('./db');

const migrate2 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_classes (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, class_id)
      );

      CREATE TABLE IF NOT EXISTS quiz_questions (
        id SERIAL PRIMARY KEY,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'mcq' CHECK (type IN ('mcq','true_false','short_answer')),
        options JSONB,
        correct_answer TEXT,
        marks INTEGER DEFAULT 1,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id SERIAL PRIMARY KEY,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        answers JSONB,
        score NUMERIC(5,2),
        submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(assessment_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS lesson_progress (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        watch_percent INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT false,
        last_watched_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, lesson_id)
      );

      CREATE TABLE IF NOT EXISTS certificates (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        issued_at TIMESTAMP DEFAULT NOW(),
        certificate_url TEXT,
        UNIQUE(student_id, course_id)
      );
    `);
    console.log('Migration 2 complete');
  } catch (err) {
    console.error('Migration 2 error:', err.message);
  } finally {
    process.exit();
  }
};

migrate2();
