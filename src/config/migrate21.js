const sql = `-- migrate21: class teacher/room/capacity, course self-enrollment flag, student_classes rebuilt with integer ids
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_classes' AND column_name='student_id' AND data_type='uuid') THEN
    IF (SELECT COUNT(*) FROM student_classes) > 0 THEN
      RAISE EXCEPTION 'student_classes has rows - not dropping';
    END IF;
    DROP TABLE student_classes;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS student_classes (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);
CREATE INDEX IF NOT EXISTS student_classes_class_idx ON student_classes(class_id);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS room VARCHAR(100);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS capacity INTEGER CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS allow_self_enrollment BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE courses ALTER COLUMN teacher_id DROP NOT NULL;
`;
module.exports = { sql };
if (require.main === module) {
  const pool = require('./db');
  pool.query(sql)
    .then(() => { console.log('migrate21 done'); return pool.end(); })
    .catch((e) => { console.error('migrate21 failed:', e.message); process.exit(1); });
}
