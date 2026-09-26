const pool = require('../config/db');

const enrollStudentToClass = async ({ student_id, class_id, school_id }) => {
  const result = await pool.query(
    `INSERT INTO student_classes (student_id, class_id, school_id)
     VALUES ($1,$2,$3) ON CONFLICT (student_id, class_id) DO NOTHING RETURNING *`,
    [student_id, class_id, school_id]
  );
  return result.rows[0];
};

const getStudentsByClass = async (class_id) => {
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.avatar_url, sc.enrolled_at
     FROM student_classes sc
     JOIN users u ON u.id=sc.student_id
     WHERE sc.class_id=$1 ORDER BY u.full_name ASC`,
    [class_id]
  );
  return result.rows;
};

const getClassesByStudent = async (student_id) => {
  const result = await pool.query(
    `SELECT c.*, sc.enrolled_at FROM student_classes sc
     JOIN classes c ON c.id=sc.class_id
     WHERE sc.student_id=$1`,
    [student_id]
  );
  return result.rows;
};

const removeStudentFromClass = async (student_id, class_id) => {
  await pool.query(
    `DELETE FROM student_classes WHERE student_id=$1 AND class_id=$2`,
    [student_id, class_id]
  );
};

module.exports = { enrollStudentToClass, getStudentsByClass, getClassesByStudent, removeStudentFromClass };
