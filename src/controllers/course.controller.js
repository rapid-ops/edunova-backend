const { createCourse, getCoursesBySchool, getCourseById, updateCourse, deleteCourse } = require('../models/course.model');

const create = async (req, res) => {
  try {
    const { school_id, class_id, title, description } = req.body;
    if (!school_id || !title) return res.status(400).json({ error: 'school_id and title required' });
    const course = await createCourse({ school_id, class_id, teacher_id: req.user.id, title, description });
    res.status(201).json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    const courses = await getCoursesBySchool(req.params.school_id);
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    const course = await getCourseById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const course = await updateCourse(req.params.id, req.body);
    res.json({ course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await deleteCourse(req.params.id);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove };
