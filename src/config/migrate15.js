require('dotenv').config();
const pool = require('./db');
(async () => {
  try {
    await pool.query(`
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
    `);
    const t = await pool.query("SELECT to_regclass('public.payment_attempts') AS t, (SELECT COUNT(*)::int FROM pg_indexes WHERE indexname='uq_payments_paystack_ref') AS idx");
    console.log('migrate15 done', JSON.stringify(t.rows[0]));
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
