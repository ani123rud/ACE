import mongoose from 'mongoose';

const QuizSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
  question: { type: String, required: true },
  options: { type: [String], validate: v => Array.isArray(v) && v.length >= 2, default: [] },
  answerIndex: { type: Number, required: true, min: 0 },
  explanation: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Quiz', QuizSchema);
