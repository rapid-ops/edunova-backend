
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("./src/config/db");
bcrypt.hash("Test1234", 10).then(h => {
  pool.query("UPDATE users SET password=$1 WHERE email=$2", [h, "tijanirt.25@student.funaab.edu.ng"])
    .then(r => { console.log("updated rows:", r.rowCount); process.exit(); });
});
