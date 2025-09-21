import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  candidateEmail: { type: String, index: true },
  domain: { type: String, index: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  progress: {
    index: { type: Number, default: 0 },
    total: { type: Number, default: 10 },
  },
  history: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
      answerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Answer' },
      score: { type: Number },
    }
  ],
  finalReport: { type: Object },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('Session', SessionSchema);
