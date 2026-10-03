const m = require('../models/automation.model');
const { validId, sameSchool, getUser, getCourse, schoolOfRow, schoolForCreate } = require('../utils/access');
const fail = (res, err) => res.status(500).json({ error: err.message });

const OPS = ['lt', 'lte', 'gt', 'eq'];
const ACTIONS = ['enroll_course', 'send_notification'];
const EVENT = /^[A-Za-z0-9_.:-]{1,100}$/;

const create = async (req, res) => {
  try {
    const { name, trigger_event, condition_field, condition_operator, condition_value, action_type, action_payload } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (typeof trigger_event !== 'string' || !EVENT.test(trigger_event)) return res.status(400).json({ error: 'Invalid trigger event' });
    if (!ACTIONS.includes(action_type)) return res.status(400).json({ error: 'Unknown action type' });
    let field = null, op = null, val = null;
    if (condition_field) {
      if (!OPS.includes(condition_operator) || condition_value === undefined || condition_value === null || String(condition_value) === '') {
        return res.status(400).json({ error: 'A condition needs an operator (lt, lte, gt, eq) and a value' });
      }
      field = String(condition_field).slice(0, 100);
      op = condition_operator;
      val = String(condition_value).slice(0, 255);
    }
    const school_id = schoolForCreate(req, res);
    if (school_id === null) return;
    const p = action_payload && typeof action_payload === 'object' ? action_payload : {};
    let payload;
    if (action_type === 'enroll_course') {
      if (!validId(p.course_id)) return res.status(400).json({ error: 'enroll_course needs a course_id' });
      const c = await getCourse(p.course_id);
      if (!c || Number(c.school_id) !== Number(school_id)) return res.status(400).json({ error: 'Course not found in this school' });
      payload = { course_id: c.id };
    } else {
      if (typeof p.title !== 'string' || !p.title.trim()) return res.status(400).json({ error: 'send_notification needs a title' });
      payload = { title: p.title.trim().slice(0, 255), body: typeof p.body === 'string' ? p.body.slice(0, 2000) : '' };
    }
    const r = await m.create({
      school_id, name: String(name).trim().slice(0, 255), trigger_event,
      condition_field: field, condition_operator: op, condition_value: val,
      action_type, action_payload: payload,
    });
    res.status(201).json({ rule: r });
  } catch (err) { fail(res, err); }
};

const list = async (req, res) => {
  try {
    if (!validId(req.params.school_id)) return res.status(404).json({ error: 'School not found' });
    if (!sameSchool(req.user, req.params.school_id)) return res.status(403).json({ error: 'Access denied' });
    res.json({ rules: await m.getBySchool(req.params.school_id) });
  } catch (err) { fail(res, err); }
};

const loadRule = async (req, res) => {
  const r = await schoolOfRow('automation_rules', req.params.id);
  if (!r) { res.status(404).json({ error: 'Rule not found' }); return null; }
  if (!sameSchool(req.user, r.school_id)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return r;
};

const toggle = async (req, res) => {
  try {
    const r = await loadRule(req, res);
    if (!r) return;
    res.json({ rule: await m.toggle(r.id) });
  } catch (err) { fail(res, err); }
};

const remove = async (req, res) => {
  try {
    const r = await loadRule(req, res);
    if (!r) return;
    await m.remove(r.id);
    res.json({ message: 'Deleted' });
  } catch (err) { fail(res, err); }
};

// Staff only. The school comes from the student, who must be in the caller's school.
const trigger = async (req, res) => {
  try {
    const { trigger_event, student_id, value } = req.body;
    if (typeof trigger_event !== 'string' || !EVENT.test(trigger_event) || !validId(student_id)) {
      return res.status(400).json({ error: 'trigger_event and student_id required' });
    }
    const st = await getUser(student_id);
    if (!st || st.role !== 'student') return res.status(404).json({ error: 'Student not found' });
    if (!sameSchool(req.user, st.school_id)) return res.status(403).json({ error: 'Access denied' });
    await m.evaluate(st.school_id, trigger_event, st.id, value);
    res.json({ message: 'Evaluated' });
  } catch (err) { fail(res, err); }
};

module.exports = { create, list, toggle, remove, trigger };
