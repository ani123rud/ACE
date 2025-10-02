import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', index: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['low','medium','high'], default: 'low', index: true },
  at: { type: Number, default: () => Date.now(), index: true },
  evidenceUrl: { type: String },
  raw: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const Alert = mongoose.models.Alert || mongoose.model('Alert', AlertSchema);
export default Alert;
