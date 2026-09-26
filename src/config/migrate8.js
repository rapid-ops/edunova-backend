const pool = require('./db');
const migrate8 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_twins (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        learning_speed VARCHAR(50) DEFAULT 'medium',
        best_study_time VARCHAR(50) DEFAULT 'morning',
        common_mistakes JSONB DEFAULT '[]',
        revision_schedule JSONB DEFAULT '[]',
        last_analyzed TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS emotion_events (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        emotion VARCHAR(50),
        confidence NUMERIC(3,2),
        action_taken VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS proof_of_work_tasks (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        company VARCHAR(255),
        task_url TEXT,
        difficulty VARCHAR(50) DEFAULT 'beginner',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS proof_of_work_submissions (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES proof_of_work_tasks(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        submission_url TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        feedback TEXT,
        submitted_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        UNIQUE(task_id, student_id)
      );
      CREATE TABLE IF NOT EXISTS peer_review_credits (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        credits NUMERIC(8,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, school_id)
      );
      CREATE TABLE IF NOT EXISTS peer_reviews (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES proof_of_work_submissions(id) ON DELETE CASCADE,
        reviewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        score NUMERIC(5,2),
        feedback TEXT,
        credits_earned NUMERIC(4,2) DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(submission_id, reviewer_id)
      );
      CREATE TABLE IF NOT EXISTS dropout_predictions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        risk_score NUMERIC(5,2),
        risk_level VARCHAR(20) DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
        factors JSONB,
        intervention_triggered BOOLEAN DEFAULT false,
        intervention_type VARCHAR(100),
        predicted_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS skill_passport (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        passport_id VARCHAR(100) UNIQUE NOT NULL,
        skills JSONB DEFAULT '[]',
        external_sources JSONB DEFAULT '[]',
        verified_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_evolution_logs (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        change_type VARCHAR(100),
        source VARCHAR(255),
        suggested_update TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Migration 8 complete');
  } catch (err) { console.error('Migration 8 error:', err.message); }
  finally { process.exit(); }
};
migrate8();
