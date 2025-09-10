import { SearchLog, UploadLog, ListLog, AuthLog } from "../models/Logs.js";

// Fonction de log pour les recherches
export async function logSearch({ user, query, results, duration }) {
  try {
    await SearchLog.create({ user, query, results, duration });
  } catch (err) {
    console.error('Erreur logSearch:', err);
  }
}

// Fonction de log pour les uploads
export async function logUpload({ user, filename, tags, size }) {
  try {
    await UploadLog.create({ user, filename, tags, size });
  } catch (err) {
    console.error('Erreur logUpload:', err);
  }
}

// Fonction de log pour la liste des documents
export async function logListDocs({ user, results }) {
  try {
    await ListLog.create({ user, results });
  } catch (err) {
    console.error('Erreur logListDocs:', err);
  }
}

// Fonction de log pour les actions d'authentification
export async function logAuth(userId, action) {
  try {
    await AuthLog.create({ userId, action });
  } catch (err) {
    console.error("Erreur lors du log d'auth:", err);
  }
}
