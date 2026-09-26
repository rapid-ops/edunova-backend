const pool = require('./db');
const migrate7 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_course_generations (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        prompt TEXT,
        source_type VARCHAR(50) DEFAULT 'prompt',
        source_url TEXT,
        generated_outline JSONB,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ai_quiz_generations (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        topic TEXT,
        questions JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ai_tutor_sessions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS skill_gap_analyses (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        cv_text TEXT,
        gaps JSONB,
        recommendations JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS adaptive_learning_profiles (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        difficulty_level INTEGER DEFAULT 5,
        avg_score NUMERIC(5,2) DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        last_updated TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, course_id)
      );
      CREATE TABLE IF NOT EXISTS blockchain_certificates (
        id SERIAL PRIMARY KEY,
        certificate_id INTEGER REFERENCES certificates(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        tx_hash VARCHAR(255),
        chain VARCHAR(50) DEFAULT 'polygon',
        token_id VARCHAR(100),
        metadata_url TEXT,
        qr_code_url TEXT,
        issued_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS career_matches (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        job_title VARCHAR(255),
        company VARCHAR(255),
        match_score NUMERIC(5,2),
        matched_competencies JSONB,
        job_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Migration 7 complete');
  } catch (err) { console.error('Migration 7 error:', err.message); }
  finally { process.exit(); }
};
migrate7();
