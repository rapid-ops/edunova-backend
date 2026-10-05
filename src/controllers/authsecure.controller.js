const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const { createUser, findUserByEmail } = require('../models/user.model');
const { sendWhatsApp } = require('../services/whatsapp.service');

const SELF_ROLES = ['student', 'teacher', 'parent'];

// Reads a token if one is sent. A missing or stale token just means "anonymous".
const optionalUser = (req) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); } catch { return null; }
};

const register = async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;
    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (typeof full_name !== 'string' || typeof email !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ error: 'Invalid input' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const caller = optionalUser(req);
    let school_id;

    if (caller && caller.role === 'super_admin') {
      if (![...SELF_ROLES, 'school_admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      school_id = req.body.school_id || null;
    } else if (caller && caller.role === 'school_admin') {
      if (!SELF_ROLES.includes(role)) {
        return res.status(403).json({ error: 'You can only create students, teachers and parents' });
      }
      if (!caller.school_id) return res.status(403).json({ error: 'Access denied' });
      school_id = caller.school_id;
    } else {
      // Not logged in (or not an admin): only the first admin of a school with no admin
      if (role !== 'school_admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      const sid = Number(req.body.school_id);
      if (!Number.isInteger(sid) || sid <= 0) {
        return res.status(400).json({ error: 'school_id required' });
      }
      const school = await pool.query(`SELECT id FROM schools WHERE id=$1`, [sid]);
      if (!school.rowCount) return res.status(400).json({ error: 'School not found' });
      const hasAdmin = await pool.query(
        `SELECT 1 FROM users WHERE school_id=$1 AND role='school_admin' LIMIT 1`, [sid]
      );
      if (hasAdmin.rowCount) {
        return res.status(403).json({ error: 'This school already has an administrator. Ask them to create your account.' });
      }
      school_id = sid;
    }

    const existing = await findUserByEmail(email);
    if (existing) return res.status(400).json({ error: 'Email already exists' });

    const user = await createUser({ school_id, full_name, email, password, role });

    // Welcome WhatsApp
    try {
      if (user.phone) {
        const schoolRes = school_id ? await pool.query('SELECT name FROM schools WHERE id=$1', [school_id]) : null;
        const schoolName = schoolRes?.rows[0]?.name || 'Edunova';
        sendWhatsApp(user.phone,
        );
      }
    } catch(e) { console.error('WhatsApp welcome error:', e.message); }

    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// No tokens are ever returned. Resets go through a school admin instead.
const forgotPassword = async (req, res) => {
  res.json({ message: 'If this account exists, ask your school administrator to reset your password.' });
};

const adminResetPassword = async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.user_id)) return res.status(404).json({ error: 'User not found' });
    const r = await pool.query(
      `SELECT id, full_name, email, role, school_id FROM users WHERE id=$1`, [req.params.user_id]
    );
    const target = r.rows[0];
    if (!target) return res.status(404).json({ error: 'User not found' });

    const caller = req.user;
    if (caller.role !== 'super_admin') {
      if (caller.school_id == null || Number(caller.school_id) !== Number(target.school_id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (!SELF_ROLES.includes(target.role)) {
        return res.status(403).json({ error: 'Only students, teachers and parents can be reset here' });
      }
    }
    if (target.id === caller.id) {
      return res.status(400).json({ error: 'Use change password for your own account' });
    }

    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let temp = '';
    for (let i = 0; i < 10; i++) temp += alphabet[crypto.randomInt(alphabet.length)];
    const hashed = await bcrypt.hash(temp, 10);
    await pool.query(
      `UPDATE users SET password=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2`,
      [hashed, target.id]
    );
    res.json({
      temp_password: temp,
      user: { id: target.id, full_name: target.full_name, email: target.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { register, forgotPassword, adminResetPassword };
