import mongoose from 'mongoose';

const FaceRefSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    embedding: { type: [Number], required: true },
    meta: {
      method: { type: String, default: 'arcface' },
      model: { type: String, default: 'r100' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('FaceRef', FaceRefSchema);
