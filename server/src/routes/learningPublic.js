import { Router } from 'express';
import Course from '../models/Course.js';
import Topic from '../models/Topic.js';
import Quiz from '../models/Quiz.js';

const r = Router();

// GET /api/learning/courses?domain=engineering
r.get('/courses', async (req, res) => {
  const { domain } = req.query;
  const where = {};
  if (domain) where.domain = String(domain);
  const items = await Course.find(where).sort({ createdAt: -1 }).lean();
  res.json(items.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })));
});

// GET /api/learning/courses/:slug
r.get('/courses/:slug', async (req, res) => {
  const { slug } = req.params;
  const course = await Course.findOne({ slug }).lean();
  if (!course) return res.status(404).json({ error: 'not found' });
  const topics = await Topic.find({ courseId: course._id }).sort({ order: 1, createdAt: 1 }).lean();
  const courseOut = { id: String(course._id), ...course };
  const topicsOut = topics.map(({ _id, ...rest }) => ({ id: String(_id), ...rest }));
  res.json({ course: courseOut, topics: topicsOut });
});

// GET /api/learning/topics/:slug
r.get('/topics/:slug', async (req, res) => {
  const { slug } = req.params;
  const topic = await Topic.findOne({ slug }).lean();
  if (!topic) return res.status(404).json({ error: 'not found' });
  const out = { id: String(topic._id), ...topic };
  res.json(out);
});

// GET /api/learning/topics/:slug/quiz
r.get('/topics/:slug/quiz', async (req, res) => {
  const { slug } = req.params;
  const topic = await Topic.findOne({ slug }).lean();
  if (!topic) return res.status(404).json({ error: 'not found' });
  const qs = await Quiz.find({ topicId: topic._id }).sort({ createdAt: -1 }).lean();
  res.json(qs.map(({ _id, ...rest }) => ({ id: String(_id), ...rest })));
});

export default r;
