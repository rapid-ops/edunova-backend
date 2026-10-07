const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');

const enableMFA = async (req, res) => {
  try {
    const uRow = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const email = uRow.rows[0]?.email || String(req.user.id);
    const secret = speakeasy.generateSecret({ name: `Edunova (${email})`, length: 20 });
    // Store temp secret (not activated yet)
    await pool.query(`UPDATE users SET totp_secret=$1 WHERE id=$2`, [secret.base32, req.user.id]);
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qr });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const verifyAndActivateMFA = async (req, res) => {
  try {
    const { token } = req.body;
    const r = await pool.query(`SELECT totp_secret FROM users WHERE id=$1`, [req.user.id]);
    const user = r.rows[0];
    if (!user?.totp_secret) return res.status(400).json({ error: 'MFA setup not started' });
    const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token, window: 1 });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });
    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    await pool.query(
      `UPDATE users SET totp_enabled=true, totp_backup_codes=$1 WHERE id=$2`,
      [JSON.stringify(backupCodes), req.user.id]
    );
    res.json({ message: 'MFA enabled', backup_codes: backupCodes });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const verifyMFALogin = async (req, res) => {
  try {
    const { partial_token, totp_token } = req.body;
    let decoded;
    try { decoded = jwt.verify(partial_token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    if (!decoded.totp_pending) return res.status(400).json({ error: 'Not a pending MFA token' });

    const r = await pool.query(`SELECT * FROM users WHERE id=$1`, [decoded.id]);
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: totp_token, window: 1 });
    if (!valid) return res.status(400).json({ error: 'Invalid MFA code' });

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, school_id: user.school_id },
      token,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const disableMFA = async (req, res) => {
  try {
    const { token } = req.body;
    const r = await pool.query(`SELECT totp_secret FROM users WHERE id=$1`, [req.user.id]);
    const user = r.rows[0];
    if (!user?.totp_secret) return res.status(400).json({ error: 'MFA not enabled' });
    const valid = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token, window: 1 });
    if (!valid) return res.status(400).json({ error: 'Invalid code' });
    await pool.query(`UPDATE users SET totp_enabled=false, totp_secret=NULL, totp_backup_codes='[]' WHERE id=$1`, [req.user.id]);
    res.json({ message: 'MFA disabled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const useBackupCode = async (req, res) => {
  try {
    const { partial_token, backup_code } = req.body;
    let decoded;
    try { decoded = jwt.verify(partial_token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    const r = await pool.query(`SELECT * FROM users WHERE id=$1`, [decoded.id]);
    const user = r.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const codes = user.totp_backup_codes || [];
    const idx = codes.indexOf(backup_code);
    if (idx === -1) return res.status(400).json({ error: 'Invalid backup code' });
    codes.splice(idx, 1);
    await pool.query(`UPDATE users SET totp_backup_codes=$1 WHERE id=$2`, [JSON.stringify(codes), user.id]);
    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, school_id: user.school_id },
      token,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { enableMFA, verifyAndActivateMFA, verifyMFALogin, disableMFA, useBackupCode };
