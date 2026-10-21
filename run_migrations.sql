ALTER TABLE assessments ADD COLUMN IF NOT EXISTS pass_mark INTEGER DEFAULT 50;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS randomize_questions BOOLEAN DEFAULT false;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS time_taken_seconds INTEGER;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS passed BOOLEAN DEFAULT false;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';
-- payments (Milestone 3)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash','bank_transfer','pos','cheque','paystack','other')),
  reference VARCHAR(100),
  note VARCHAR(255),
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_school ON payments(school_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_fee ON payments(fee_id);
