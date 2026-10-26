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

-- payment_attempts (migrate15)
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(100) NOT NULL UNIQUE,
  fee_id INTEGER NOT NULL REFERENCES public.fees(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','paid')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_fee ON public.payment_attempts (fee_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paystack_ref ON public.payments (reference) WHERE method = 'paystack';

-- lesson file uploads
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS file_path TEXT, ADD COLUMN IF NOT EXISTS file_name TEXT, ADD COLUMN IF NOT EXISTS file_type VARCHAR(20), ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- migrate19: sign-in IDs, one-time codes, invitation tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_key ON users (login_id) WHERE login_id IS NOT NULL;
UPDATE users u SET login_id = 'EDU' || u.school_id || '-' || CASE u.role WHEN 'student' THEN 'S' ELSE 'T' END || LPAD(n.rn::text, 4, '0')
FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY school_id, role ORDER BY id) AS rn FROM users WHERE role IN ('student','teacher') AND school_id IS NOT NULL) n
WHERE u.id = n.id AND u.login_id IS NULL;

-- migrate20: invitation email tracking for bulk import
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_emailed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_tried_at TIMESTAMP;
UPDATE users SET invite_emailed_at = invited_at, invite_tried_at = invited_at WHERE role = 'parent' AND invited_at IS NOT NULL AND invite_emailed_at IS NULL;

-- migrate22
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;

-- profile photo: stored public id for cleanup
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;
