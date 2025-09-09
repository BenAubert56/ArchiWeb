import { SearchLog, AuthLog } from "../models/Logs.js";

export async function logSearch(userId, query, resultsCount, durationMs) {
  try {
    await SearchLog.create({ userId, query, resultsCount, durationMs });
  } catch (err) {
    console.error('Erreur lors du log de recherche:', err);
}
}

export async function logAuth(userId, action) {
  try {
    await AuthLog.create({ userId, action });
  } catch (err) {
    console.error("Erreur lors du log d'auth:", err);
  }
}
