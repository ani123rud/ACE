import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  candidateText: { type: String },
  askedDifficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
  eval: {
    score: { type: Number, min: 0, max: 10 },
    feedback: { type: String },
  },
  nextSuggestion: {
    question: { type: String },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  },
  retrievedRefs: [{ type: String }],
  meta: { type: Object },
}, { timestamps: true });

export default mongoose.model('Answer', AnswerSchema);
