const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const createUser = async ({ school_id, full_name, email, password, role }) => {
  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (school_id, full_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role, school_id`,
    [school_id, full_name, email, hashed, role]
  );
  return result.rows[0];
};

const findUserByEmail = async (login) => {
  const v = String(login == null ? '' : login).trim();
  if (!v) return undefined;
  if (v.includes('@')) {
    const r = await pool.query(
      `SELECT * FROM users WHERE lower(email) = lower($1) ORDER BY (email = $1) DESC, id LIMIT 1`,
      [v]
    );
    return r.rows[0];
  }
  const r = await pool.query(`SELECT * FROM users WHERE login_id = $1 LIMIT 1`, [v.toUpperCase()]);
  return r.rows[0];
};

module.exports = { createUser, findUserByEmail };
