const pool = require('./db');
const migrate5 = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS competencies (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_competencies (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        competency_id INTEGER REFERENCES competencies(id) ON DELETE CASCADE,
        UNIQUE(course_id, competency_id)
      );
      CREATE TABLE IF NOT EXISTS student_competencies (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        competency_id INTEGER REFERENCES competencies(id) ON DELETE CASCADE,
        level INTEGER DEFAULT 0,
        achieved_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, competency_id)
      );
      CREATE TABLE IF NOT EXISTS proctoring_sessions (
        id SERIAL PRIMARY KEY,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        tab_switches INTEGER DEFAULT 0,
        flags JSONB,
        recording_url TEXT,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','completed','flagged'))
      );
      CREATE TABLE IF NOT EXISTS custom_roles (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_custom_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER REFERENCES custom_roles(id) ON DELETE CASCADE,
        UNIQUE(user_id, role_id)
      );
      CREATE TABLE IF NOT EXISTS automation_rules (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        trigger_event VARCHAR(100) NOT NULL,
        condition_field VARCHAR(100),
        condition_operator VARCHAR(20),
        condition_value TEXT,
        action_type VARCHAR(100) NOT NULL,
        action_payload JSONB,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS automation_logs (
        id SERIAL PRIMARY KEY,
        rule_id INTEGER REFERENCES automation_rules(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        triggered_at TIMESTAMP DEFAULT NOW(),
        result TEXT
      );
      CREATE TABLE IF NOT EXISTS scorm_packages (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        title VARCHAR(255),
        package_url TEXT NOT NULL,
        version VARCHAR(20) DEFAULT 'scorm_12',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS scorm_progress (
        id SERIAL PRIMARY KEY,
        package_id INTEGER REFERENCES scorm_packages(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        cmi_data JSONB,
        completion_status VARCHAR(50) DEFAULT 'incomplete',
        score NUMERIC(5,2),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(package_id, student_id)
      );
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_proctored BOOLEAN DEFAULT false;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT false;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS negative_marking NUMERIC(3,2) DEFAULT 0;
      ALTER TABLE assessments ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 1;
    `);
    console.log('Migration 5 complete');
  } catch (err) { console.error('Migration 5 error:', err.message); }
  finally { process.exit(); }
};
migrate5();
