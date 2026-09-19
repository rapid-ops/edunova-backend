const pool = require('../config/db');

const createSchool = async ({ name, email, phone, address, subdomain }) => {
  const result = await pool.query(
    `INSERT INTO schools (name, email, phone, address, subdomain)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, email, phone, address, subdomain]
  );
  return result.rows[0];
};

const findSchoolBySubdomain = async (subdomain) => {
  const result = await pool.query(
    `SELECT * FROM schools WHERE subdomain = $1`,
    [subdomain]
  );
  return result.rows[0];
};

const findSchoolById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM schools WHERE id = $1`,
    [id]
  );
  return result.rows[0];
};

const getAllSchools = async () => {
  const result = await pool.query(`SELECT * FROM schools ORDER BY created_at DESC`);
  return result.rows;
};

module.exports = { createSchool, findSchoolBySubdomain, findSchoolById, getAllSchools };
