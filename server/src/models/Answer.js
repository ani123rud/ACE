import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  candidateText: { type: String },
  eval: {
    score: { type: Number, min: 0, max: 10 },
    feedback: { type: String },
  },
  retrievedRefs: [{ type: String }],
}, { timestamps: true });

export default mongoose.model('Answer', AnswerSchema);
