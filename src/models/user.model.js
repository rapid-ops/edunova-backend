const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const createUser = async ({ school_id, full_name, email, password, role }) => {
  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (school_id, full_name, email, password, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role`,
    [school_id, full_name, email, hashed, role]
  );
  return result.rows[0];
};

const findUserByEmail = async (email) => {
  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0];
};

module.exports = { createUser, findUserByEmail };
