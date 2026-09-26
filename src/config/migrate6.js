const pool = require('./db');
const migrate6 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
        total_credits NUMERIC(5,2) DEFAULT 0,
        gpa NUMERIC(3,2) DEFAULT 0,
        cgpa NUMERIC(3,2) DEFAULT 0,
        generated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS transcript_entries (
        id SERIAL PRIMARY KEY,
        transcript_id INTEGER REFERENCES transcripts(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        course_title VARCHAR(255),
        credits NUMERIC(3,1) DEFAULT 3,
        score NUMERIC(5,2),
        letter_grade VARCHAR(5),
        grade_points NUMERIC(3,2)
      );
      CREATE TABLE IF NOT EXISTS curriculum_standards (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        framework VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_standards (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        standard_id INTEGER REFERENCES curriculum_standards(id) ON DELETE CASCADE,
        UNIQUE(course_id, standard_id)
      );
      CREATE TABLE IF NOT EXISTS accreditation_credits (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        credit_type VARCHAR(100) DEFAULT 'CEU',
        credits NUMERIC(5,2) NOT NULL,
        issued_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        renewal_sent BOOLEAN DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS virtual_labs (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        lab_url TEXT,
        lab_type VARCHAR(50) DEFAULT 'simulation',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS lab_submissions (
        id SERIAL PRIMARY KEY,
        lab_id INTEGER REFERENCES virtual_labs(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        data JSONB,
        score NUMERIC(5,2),
        submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(lab_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        entity VARCHAR(100),
        entity_id INTEGER,
        meta JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS credits NUMERIC(3,1) DEFAULT 3;
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS curriculum_standard_id INTEGER REFERENCES curriculum_standards(id) ON DELETE SET NULL;
    `);
    console.log('Migration 6 complete');
  } catch (err) { console.error('Migration 6 error:', err.message); }
  finally { process.exit(); }
};
migrate6();
