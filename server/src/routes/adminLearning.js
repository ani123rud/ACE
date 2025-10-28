import { Router } from 'express';
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Topic from '../models/Topic.js';
import Quiz from '../models/Quiz.js';

const r = Router();
const isValidObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v));

function checkAdmin(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  const hdr = req.headers['x-admin-token'] || req.headers['authorization'] || '';
  const token = typeof hdr === 'string' && hdr.toLowerCase().startsWith('bearer ')
    ? hdr.slice(7)
    : hdr;
  if (!configured || token !== configured) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Courses
r.get('/learning/courses', checkAdmin, async (_req, res) => {
  try {
    const items = await Course.find().sort({ createdAt: -1 }).lean();
    res.json(items.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })));
  } catch (e) {
    res.status(500).json({ error: 'failed to list courses' });
  }
});

r.post('/learning/courses', checkAdmin, async (req, res) => {
  const body = req.body || {};
  if (!body.title || !body.slug || !body.domain) return res.status(400).json({ error: 'title, slug, domain required' });
  const created = await Course.create({
    title: String(body.title),
    slug: String(body.slug),
    domain: String(body.domain),
    description: String(body.description || ''),
    tags: Array.isArray(body.tags) ? body.tags : [],
    difficulty: body.difficulty || 'beginner',
    duration: String(body.duration || '')
  });
  const obj = created.toObject();
  res.json({ id: String(obj._id), ...obj });
});

r.put('/learning/courses/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const body = req.body || {};
    const doc = await Course.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ id: String(doc._id), ...doc });
  } catch (e) {
    res.status(500).json({ error: 'failed to update course' });
  }
});

r.delete('/learning/courses/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const topicIds = (await Topic.find({ courseId: id }).select('_id')).map(t => t._id);
    if (topicIds.length) await Quiz.deleteMany({ topicId: { $in: topicIds } });
    await Topic.deleteMany({ courseId: id });
    const result = await Course.findByIdAndDelete(id).lean();
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to delete course' });
  }
});

// Topics
r.get('/learning/courses/:courseId/topics', checkAdmin, async (req, res) => {
  const { courseId } = req.params;
  if (!isValidObjectId(courseId)) return res.status(400).json({ error: 'invalid courseId' });
  try {
    const items = await Topic.find({ courseId }).sort({ order: 1, createdAt: 1 }).lean();
    res.json(items.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })));
  } catch (e) {
    res.status(500).json({ error: 'failed to list topics' });
  }
});

r.post('/learning/courses/:courseId/topics', checkAdmin, async (req, res) => {
  const { courseId } = req.params;
  if (!isValidObjectId(courseId)) return res.status(400).json({ error: 'invalid courseId' });
  try {
    const body = req.body || {};
    if (!body.title || !body.slug) return res.status(400).json({ error: 'title, slug required' });
    const created = await Topic.create({
      courseId,
      title: String(body.title),
      slug: String(body.slug),
      content: String(body.content || ''),
      order: Number.isFinite(body.order) ? Number(body.order) : 0
    });
    const obj = created.toObject();
    res.json({ id: String(obj._id), ...obj });
  } catch (e) {
    res.status(500).json({ error: 'failed to create topic' });
  }
});

r.put('/learning/topics/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const body = req.body || {};
    const doc = await Topic.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ id: String(doc._id), ...doc });
  } catch (e) {
    res.status(500).json({ error: 'failed to update topic' });
  }
});

r.delete('/learning/topics/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    await Quiz.deleteMany({ topicId: id });
    const result = await Topic.findByIdAndDelete(id).lean();
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to delete topic' });
  }
});

// Quizzes
r.get('/learning/topics/:topicId/quizzes', checkAdmin, async (req, res) => {
  const { topicId } = req.params;
  if (!isValidObjectId(topicId)) return res.status(400).json({ error: 'invalid topicId' });
  try {
    const items = await Quiz.find({ topicId }).sort({ createdAt: -1 }).lean();
    res.json(items.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })));
  } catch (e) {
    res.status(500).json({ error: 'failed to list quizzes' });
  }
});

r.post('/learning/topics/:topicId/quizzes', checkAdmin, async (req, res) => {
  const { topicId } = req.params;
  if (!isValidObjectId(topicId)) return res.status(400).json({ error: 'invalid topicId' });
  try {
    const body = req.body || {};
    if (!body.question || !Array.isArray(body.options) || typeof body.answerIndex !== 'number') {
      return res.status(400).json({ error: 'question, options[], answerIndex required' });
    }
    const created = await Quiz.create({
      topicId,
      question: String(body.question),
      options: body.options.map(String),
      answerIndex: Number(body.answerIndex),
      explanation: String(body.explanation || '')
    });
    const obj = created.toObject();
    res.json({ id: String(obj._id), ...obj });
  } catch (e) {
    res.status(500).json({ error: 'failed to create quiz' });
  }
});

r.put('/learning/quizzes/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const body = req.body || {};
    const doc = await Quiz.findByIdAndUpdate(id, body, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ id: String(doc._id), ...doc });
  } catch (e) {
    res.status(500).json({ error: 'failed to update quiz' });
  }
});

r.delete('/learning/quizzes/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const result = await Quiz.findByIdAndDelete(id).lean();
    if (!result) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to delete quiz' });
  }
});

export default r;
