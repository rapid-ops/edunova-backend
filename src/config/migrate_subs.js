const pool = require('./db');
(async () => {
  try {
    await pool.query(`
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paystack_reference VARCHAR(100);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_reference ON subscriptions(paystack_reference) WHERE paystack_reference IS NOT NULL;
    `);
    const r = await pool.query(`select column_name from information_schema.columns where table_name='subscriptions' and column_name='paystack_reference'`);
    console.log(r.rowCount ? 'Subscriptions migration done' : 'Column missing');
  } catch (e) { console.error('Migration failed:', e.message); }
  finally { process.exit(0); }
})();
