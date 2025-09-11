import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Client } from '@elastic/elasticsearch';
import {
  cacheMiddleware,
  cacheJSONResponse,
  bumpCacheVersion,
  clearCache
} from './cache.js';
import { v4 as uuidv4 } from 'uuid';
import { logSearch, logUpload, logListDocs } from './utils/logger.js';
import sw from 'stopword';
import { auth } from './middleware/auth.js';
import { SearchLog } from './models/Logs.js';
import crypto from 'crypto';
import { extractPagesText } from './utils/pdfUtils.js';

const app = express();
app.use(cors());
app.use(express.json());

// Mongo + auth
app.get('/', (req, res) =>
  res.json({ ok: true, service: 'Service API' })
);
app.use('/api/auth', authRoutes);

// ---------- Elasticsearch Cluster Setup ----------
const client = new Client({
  nodes: [
    'http://10.104.126.159:9200',
    'http://10.104.126.129:9200',
    'http://10.104.126.60:9200',
    'http://10.104.126.189:9200',
    'http://10.104.126.67:9200'
  ]
});

// Dossier de stockage permanent
const STORAGE_DIR = path.join(process.cwd(), 'stored_pdfs');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR);
}

const upload = multer({ dest: 'uploads/' });
const stopwords = new Set(sw.fra);

// ---------- Helpers ----------

// fonction pour extraire les tags en enlevant les pronoms
function extractTags(text, limit = 20) {
  const words = text
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñæœ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, limit).map(([word]) => word);
}

async function docExists({ filename, originalName, content, author, size, createdAt }) {
  // Générer un hash du contenu texte
  const contentHash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');

  // Rechercher un doc avec le même hash
  const result = await client.search({
    index: 'pdfs',
    size: 1,
    query: {
      bool: {
        must: [
          { term: { contentHash } },
          { term: { 'author.keyword': author || 'unknown' } },
          { term: { size } }
        ],
        must_not: [
          // pas besoin de comparer le filename car nom unique
        ]
      }
    }
  });
  if (result.hits.hits.length > 0) {
    console.log('Doublon détecté via hash');
    return true; // doublon exact
  }
  return false;
}

// ---------- Upload PDF & Index ----------
app.post(
  '/api/pdfs/upload',
  auth,
  upload.single('pdf'),
  async (req, res) => {
    try {
      const uniqueName = `${Date.now()}-${uuidv4()}-${req.file.originalname}`;
      const storedFilePath = path.join(STORAGE_DIR, uniqueName);
      fs.renameSync(req.file.path, storedFilePath);

      const dataBuffer = fs.readFileSync(storedFilePath);
      const pdfData = await pdfParse(dataBuffer);

      // Métadonnées + hash
      const metadata = {
        filename: uniqueName,
        originalName: req.file.originalname,
        content: pdfData.text,
        author: pdfData.info?.Author || 'unknown',
        size: req.file.size,
        createdAt: pdfData.info?.CreationDate || null
      };

      const exists = await docExists(metadata);
      if (exists) {
        fs.unlinkSync(storedFilePath); // supprimer car doublon
        return res.status(409).json({ error: 'Fichier déjà indexé' });
      }

      const contentHash = crypto
        .createHash('sha256')
        .update(pdfData.text)
        .digest('hex');

      const tags = extractTags(pdfData.text);

      const pages = await extractPagesText(storedFilePath);

      const doc = {
        ...metadata,
        contentHash,
        tags,
        pages,
        uploadedAt: new Date(),
        originalPath: storedFilePath
      };

      const response = await client.index({
        index: 'pdfs',
        document: doc
      });

      await logUpload({
        user: req.user?.id || 'anonymous',
        filename: uniqueName,
        originalName: req.file.originalname,
        tags,
        size: req.file.size
      });

      await client.indices.refresh({ index: 'pdfs' });
      await bumpCacheVersion();

      res.json({
        message: 'PDF indexé avec succès',
        id: response._id,
        doc
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur lors de l'upload PDF" });
    }
  }
);

// ---------- Recherche PDF ----------
app.get("/api/pdfs/search", auth, async (req, res) => {
  const start = Date.now();
  try {
    const { q = "", page: pageStr } = req.query;
    const query = String(q || "").trim();
    const FIXED_PAGE_SIZE = 20;

    if (!query) {
      return cacheJSONResponse(
        req,
        res,
        { hits: [], total: 0, page: 1, pageSize: FIXED_PAGE_SIZE, totalPages: 0, duration: 0 },
        { ttlSeconds: 60 }
      );
    }

    const page = Math.max(1, Number.parseInt(pageStr) || 1);
    const pageSize = FIXED_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const result = await client.search({
      index: "pdfs",
      _source: ["filename", "uploadedAt", "originalName"], // <-- inclut filename
      from,
      size: pageSize,
      track_total_hits: true,
      query: {
        bool: {
          should: [
            { term: { "originalName.keyword": { value: q, boost: 3 } } },
            { terms: { tags: q.split(/\s+/) } },
            {
              nested: {
                path: "pages",
                query: { match: { "pages.text": { query, operator: "and" } } },
                inner_hits: {
                  name: "pages_matching",
                  _source: ["pageNumber"],
                  highlight: {
                    fields: {
                      "pages.text": {
                        fragment_size: 140,
                        number_of_fragments: 3,
                        pre_tags: ["<mark>"],
                        post_tags: ["</mark>"]
                      }
                    }
                  }
                }
              }
            }
          ]
        }
      }
    });

    const items = [];
    for (const hit of result.hits.hits) {
      const id = hit._id;
      const src = hit._source || {};
      const fileName = src.filename ?? null;         // <-- mapping filename -> fileName
      const uploadedAt = src.uploadedAt ?? null;

      let pageNumber = null;
      let snippet = "";

      const inner = hit.inner_hits?.pages_matching?.hits?.hits ?? [];
      if (inner.length > 0) {
        pageNumber = inner[0]._source?.pageNumber;
        snippet = inner[0].highlight?.["pages.text"]?.[0] ?? "";
      }

      items.push({ id, fileName, uploadedAt, snippet, pageNumber });
    }

    const total = typeof result.hits.total === "number"
      ? result.hits.total
      : (result.hits.total?.value ?? items.length);

    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const duration = Date.now() - start;

    await logSearch({
      user: req.user.id,
      query,
      results: items.length,
      duration
    });

    return cacheJSONResponse(
      req,
      res,
      { hits: items, total, page, pageSize, totalPages, duration },
      { ttlSeconds: 86400 }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la recherche PDF" });
  }
});

// ---------- Lister tous les PDFs indexés ----------
app.get(
  '/api/pdfs',
  auth,
  cacheMiddleware({ ttlSeconds: 84000 }),
  async (req, res) => {
    try {
      const result = await client.search({
        index: 'pdfs',
        _source: ['filename', 'tags', 'uploadedAt'],
        size: 1000,
        query: { match_all: {} }
      });

      const body = result.hits.hits;

      await logListDocs({
        user: req.user.id,
        results: body.length
      });

      return cacheJSONResponse(req, res, body, { ttlSeconds: 86400 });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: 'Erreur lors de la récupération des PDFs' });
    }
  }
);

app.delete('/api/cache', auth, async (req, res) => {
  try {
    await clearCache();
    res.json({ success: true, message: 'Cache vidé' });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Impossible de vider le cache: ${err}`
    });
  }
});

// ---------- Télécharger un PDF ----------
app.get('/api/pdfs/:id/download', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.get({ index: 'pdfs', id });

    const { filePath, originalName } = result._source;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.download(filePath, originalName);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

app.get('/api/pdfs/:id/open', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.get({ index: 'pdfs', id });

    const { originalPath, filename } = result._source;
    if (!fs.existsSync(originalPath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(originalPath).pipe(res);
  } catch (err) {
    if (err.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Document non trouvé' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’ouverture du PDF' });
  }
});

// GET /api/search/suggestions?q=mot
app.get('/api/pdfs/suggestions', auth, async (req, res) => {
  try {
    const user = req.user.id;
    const { q = '' } = req.query;
    if (!q || q.length < 1) return res.json([]);

    // Cherche les requêtes de l'utilisateur commençant par q (insensible à la casse)
    const suggestions = await SearchLog.find({
      user,
      query: { $regex: '^' + q, $options: 'i' }
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .distinct('query');

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des suggestions de recherches' });
  }
});

// ---------- Supprimer tous les PDFs, index et cache (sans auth) ----------
app.delete('/api/reset-all', async (req, res) => {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(STORAGE_DIR, file));
    }

    const indexExists = await client.indices.exists({ index: 'pdfs' });
    if (indexExists) {
      await client.indices.delete({ index: 'pdfs' });
    }

    await client.indices.create({ index: 'pdfs' });

    await clearCache();

    res.json({
      success: true,
      message: 'Tous les fichiers, index et cache ont été supprimés'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: `Erreur lors de la réinitialisation: ${err.message}`
    });
  }
});

// ---------- 404 & erreurs ----------
app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// ---------- Démarrage ----------
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  connectDB(process.env.MONGODB_URI)
    .then(() =>
      app.listen(PORT, async () => {
        console.log(`API sur http://localhost:${PORT}`);
        try {
          // Invalide les anciennes entrées de cache
          await bumpCacheVersion();
          console.log('Cache version bumped on startup');
        } catch (e) {
          console.warn('Unable to bump cache version on startup:', e);
        }
      })
    )
    .catch(err => {
      console.error('Échec connexion BDD', err);
      process.exit(1);
    });
}

export default app;
