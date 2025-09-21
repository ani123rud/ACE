import mongoose from 'mongoose';

const MaterialSchema = new mongoose.Schema({
  domain: { type: String, index: true },
  url: { type: String },
  chunkId: { type: String },
  text: { type: String, required: true },
  embedding: [{ type: Number, index: true }],
  source: { type: String },
}, { timestamps: true });

export default mongoose.model('Material', MaterialSchema);
