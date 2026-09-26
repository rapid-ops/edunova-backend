const pool = require('../config/db');
const create = async ({ school_id, name, trigger_event, condition_field, condition_operator, condition_value, action_type, action_payload }) => { const r = await pool.query(`INSERT INTO automation_rules (school_id,name,trigger_event,condition_field,condition_operator,condition_value,action_type,action_payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [school_id, name, trigger_event, condition_field, condition_operator, condition_value, action_type, JSON.stringify(action_payload || {})]); return r.rows[0]; };
const getBySchool = async (school_id) => { const r = await pool.query(`SELECT * FROM automation_rules WHERE school_id=$1 ORDER BY created_at DESC`, [school_id]); return r.rows; };
const getActive = async (school_id, trigger_event) => { const r = await pool.query(`SELECT * FROM automation_rules WHERE school_id=$1 AND trigger_event=$2 AND is_active=true`, [school_id, trigger_event]); return r.rows; };
const toggle = async (id) => { const r = await pool.query(`UPDATE automation_rules SET is_active=NOT is_active WHERE id=$1 RETURNING *`, [id]); return r.rows[0]; };
const remove = async (id) => { await pool.query(`DELETE FROM automation_rules WHERE id=$1`, [id]); };
const logRun = async ({ rule_id, student_id, result }) => { await pool.query(`INSERT INTO automation_logs (rule_id,student_id,result) VALUES ($1,$2,$3)`, [rule_id, student_id, result]); };
const evaluate = async (school_id, trigger_event, student_id, value) => {
  const rules = await getActive(school_id, trigger_event);
  const pool2 = require('../config/db');
  for (const rule of rules) {
    let match = false;
    if (!rule.condition_field) { match = true; }
    else if (rule.condition_operator === 'lt') match = parseFloat(value) < parseFloat(rule.condition_value);
    else if (rule.condition_operator === 'lte') match = parseFloat(value) <= parseFloat(rule.condition_value);
    else if (rule.condition_operator === 'gt') match = parseFloat(value) > parseFloat(rule.condition_value);
    else if (rule.condition_operator === 'eq') match = String(value) === String(rule.condition_value);
    if (match) {
      const payload = rule.action_payload || {};
      if (rule.action_type === 'enroll_course' && payload.course_id) {
        await pool2.query(`INSERT INTO enrollments (student_id,course_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [student_id, payload.course_id]);
      } else if (rule.action_type === 'send_notification' && payload.title) {
        await pool2.query(`INSERT INTO notifications (school_id,user_id,title,body,type) VALUES ($1,$2,$3,$4,'automation')`, [school_id, student_id, payload.title, payload.body || '']);
      }
      await logRun({ rule_id: rule.id, student_id, result: `action:${rule.action_type} triggered` });
    }
  }
};
module.exports = { create, getBySchool, getActive, toggle, remove, logRun, evaluate };
