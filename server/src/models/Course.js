import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  domain: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  tags: { type: [String], default: [] },
  difficulty: { type: String, enum: ['beginner','intermediate','advanced'], default: 'beginner' },
  duration: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Course', CourseSchema);
