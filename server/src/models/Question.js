import mongoose from 'mongoose';

const QuestionSchema = new mongoose.Schema({
  domain: { type: String, index: true },
  question: { type: String, required: true },
  answer: { type: String },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy', index: true },
  tags: [{ type: String }],
  embedding: [{ type: Number }],
  source: { type: String },
  sourceRefs: [{ type: String }],
}, { timestamps: true });

export default mongoose.model('Question', QuestionSchema);
