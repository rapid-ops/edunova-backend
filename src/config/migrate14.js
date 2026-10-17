require('dotenv').config();
const pool = require('./db');
(async () => {
  try {
    await pool.query(`
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected'));
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_users_pending ON public.users (school_id) WHERE approval_status = 'pending';
    `);
    const r = await pool.query('SELECT approval_status, COUNT(*)::int AS n FROM public.users GROUP BY 1');
    console.log('migrate14 done', JSON.stringify(r.rows));
  } catch (e) { console.error(e.message); }
  finally { await pool.end(); }
})();
