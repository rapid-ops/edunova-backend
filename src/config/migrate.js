const pool = require('./db');

const migrate = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        logo_url TEXT,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        subscription_plan VARCHAR(50) DEFAULT 'basic',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin','school_admin','teacher','student','parent')),
        is_active BOOLEAN DEFAULT true,
        avatar_url TEXT,
        phone VARCHAR(20),
        reset_token TEXT,
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        grade_level VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        is_published BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        video_url TEXT,
        file_url TEXT,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS assessments (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) CHECK (type IN ('quiz','assignment','exam')),
        due_date TIMESTAMP,
        total_marks INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS enrollments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, course_id)
      );

      CREATE TABLE IF NOT EXISTS fees (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10,2) NOT NULL,
        description VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
        due_date TIMESTAMP,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        status VARCHAR(20) CHECK (status IN ('present','absent','late')),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        type VARCHAR(50) DEFAULT 'general',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        score NUMERIC(5,2) NOT NULL,
        feedback TEXT,
        graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, assessment_id)
      );

      CREATE TABLE IF NOT EXISTS timetable (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        assessment_id INTEGER REFERENCES assessments(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(assessment_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS parent_student (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(parent_id, student_id)
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
        plan VARCHAR(50) NOT NULL DEFAULT 'basic',
        status VARCHAR(50) DEFAULT 'trial' CHECK (status IN ('trial','active','expired','cancelled')),
        paystack_customer_code VARCHAR(100),
        paystack_subscription_code VARCHAR(100),
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        trial_ends_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
};

migrate();
