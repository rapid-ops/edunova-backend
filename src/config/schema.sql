-- Schools
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

-- Users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin','school_admin','teacher','student','parent')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Classes
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  grade_level VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Courses
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

-- Lessons
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

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) CHECK (type IN ('quiz','assignment','exam')),
  due_date TIMESTAMP,
  total_marks INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Students enrollment
CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

-- Fees
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

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('present','absent','late')),
  created_at TIMESTAMP DEFAULT NOW()
);
