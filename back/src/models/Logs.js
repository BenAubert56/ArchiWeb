import mongoose from "mongoose";

const searchLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  query: { type: String, required: true },
  resultsCount: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

const authLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, enum: ["connexion", "deconnexion", "creation"], required: true },
  timestamp: { type: Date, default: Date.now }
});

searchLogSchema.index({ userId: 1, timestamp: -1 });
authLogSchema.index({ userId: 1, timestamp: -1 });

export const SearchLog = mongoose.model("SearchLog", searchLogSchema);
export const AuthLog = mongoose.model("AuthLog", authLogSchema);
