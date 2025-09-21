import mongoose from 'mongoose';

const ProctorLogSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
  type: { type: String, enum: ['face_count', 'tab_switch', 'noise', 'multi_speaker'] },
  data: { type: Object },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
}, { timestamps: true });

export default mongoose.model('ProctorLog', ProctorLogSchema);
