const { createLesson, getLessonsByCourse, getLessonById, updateLesson, deleteLesson } = require('../models/lesson.model');

const create = async (req, res) => {
  try {
    const { course_id, title, content, video_url, file_url, position } = req.body;
    if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required' });
    const lesson = await createLesson({ course_id, title, content, video_url, file_url, position: position || 0 });
    res.status(201).json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const list = async (req, res) => {
  try {
    const lessons = await getLessonsByCourse(req.params.course_id);
    res.json({ lessons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const get = async (req, res) => {
  try {
    const lesson = await getLessonById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const lesson = await updateLesson(req.params.id, req.body);
    res.json({ lesson });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await deleteLesson(req.params.id);
    res.json({ message: 'Lesson deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { create, list, get, update, remove };
