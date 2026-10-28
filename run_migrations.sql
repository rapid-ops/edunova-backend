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

-- migrate21: class teacher/room/capacity, course self-enrollment flag, student_classes rebuilt with integer ids
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


-- Worker 7: approval columns (earlier work, migrate14)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_users_pending ON public.users (school_id) WHERE approval_status = 'pending';

-- Worker 7: school registration details and email confirmation
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS school_type VARCHAR(60);
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS state VARCHAR(60);
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS lga VARCHAR(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
UPDATE public.users SET email_verified_at = COALESCE(created_at, NOW()) WHERE email_verified_at IS NULL AND approval_status <> 'unverified';
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%approval_status%' LOOP
    EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;
ALTER TABLE public.users ADD CONSTRAINT users_approval_status_check CHECK (approval_status IN ('unverified','pending','approved','rejected'));
CREATE TABLE IF NOT EXISTS public.signup_verifications (
  id SERIAL PRIMARY KEY,
  purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('school','user')),
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signup_verif_email ON public.signup_verifications (lower(email), purpose) WHERE used_at IS NULL;
CREATE TABLE IF NOT EXISTS public.signup_email_sends (
  id SERIAL PRIMARY KEY,
  email_lc VARCHAR(255) NOT NULL,
  purpose VARCHAR(10) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signup_sends_email ON public.signup_email_sends (email_lc, sent_at);

-- migrate25 (Worker 4): assessment draft/publish, close, results release, show answers, question explanation
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assessments ALTER COLUMN is_published SET DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS show_answers BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS results_released BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assessments ALTER COLUMN results_released SET DEFAULT false;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation TEXT;
