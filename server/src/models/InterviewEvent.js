import mongoose from 'mongoose';

const InterviewEventSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true, required: true },
  type: { type: String, required: true },
  payload: { type: Object },
  severity: { type: String, enum: ['low','medium','high'], default: 'low' },
  at: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('InterviewEvent', InterviewEventSchema);
