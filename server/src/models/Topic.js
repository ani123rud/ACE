import mongoose from 'mongoose';

const TopicSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true },
  slug: { type: String, required: true, index: true },
  content: { type: String, default: '' },
  order: { type: Number, default: 0, index: true },
}, { timestamps: true });

TopicSchema.index({ courseId: 1, slug: 1 }, { unique: true });

export default mongoose.model('Topic', TopicSchema);
