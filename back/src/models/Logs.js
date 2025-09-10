import mongoose from "mongoose";

const searchLogSchema = new mongoose.Schema({
  user: { type: String, required: true },
  query: { type: String, required: true },
  results: { type: Number, required: true },
  duration: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

const uploadLogSchema = new mongoose.Schema({
  user: { type: String, required: true },
  filename: { type: String, required: true },
  tags: [String],
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now }
});

const listLogSchema = new mongoose.Schema({
  user: { type: String, required: true },
  action: { type: String, default: 'list_docs' },
  results: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});


const authLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, enum: ["connexion", "deconnexion", "creation"], required: true },
  timestamp: { type: Date, default: Date.now }
});

authLogSchema.index({ userId: 1, timestamp: -1 });

export const SearchLog = mongoose.model("SearchLog", searchLogSchema);
export const UploadLog = mongoose.model("UploadLog", uploadLogSchema);
export const ListLog = mongoose.model('ListLog', listLogSchema);
export const AuthLog = mongoose.model("AuthLog", authLogSchema);

