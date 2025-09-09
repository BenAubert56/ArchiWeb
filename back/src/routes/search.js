import { SearchLog, AuthLog } from "../models/Logs.js";

export async function logSearch(userId, query, resultsCount, durationMs) {
  await SearchLog.create({ userId, query, resultsCount, durationMs });
}

export async function logAuth(userId, action) {
  await AuthLog.create({ userId, action });
}
