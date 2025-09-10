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

async function docExists({ filename, content, author, size, createdAt }) {
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

    const doc = {
      ...metadata,
      contentHash,
      tags,
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
app.get(
  '/api/pdfs/search',
  auth,
  cacheMiddleware({ ttlSeconds: 86400 }),
  async (req, res) => {
    const start = Date.now();
    try {
      const { q = '' } = req.query;
      const query = String(q || '').trim();
      if (!query) {
        return cacheJSONResponse(req, res, [], { ttlSeconds: 60 });
      }

      const result = await client.search({
        index: 'pdfs',
        _source: ['filename', 'uploadedAt'],
        size: 50,
        query: {
          bool: {
            should: [
              { term: { 'filename.keyword': { value: q, boost: 3 } } },
              { terms: { tags: q.split(' '), boost: 2 } },
              {
                multi_match: {
                  query: q,
                  fields: ['content'],
                  type: 'best_fields'
                }
              }
            ]
          }
        },
        highlight: {
          fields: {
            content: {
              fragment_size: 140,
              number_of_fragments: 10,
              pre_tags: ['<mark>'],
              post_tags: ['</mark>'],
              fragmenter: 'simple'
            }
          }
        }
      });

      const snippets = [];
      for (const hit of result.hits.hits) {
        const id = hit._id;
        const { filename, uploadedAt } = hit._source || {};
        const contentFragments = hit.highlight?.content || [];

        const cleanSnippets = contentFragments.map(frag =>
          frag.replace(/-\s*/g, '').replace(/\s+/g, ' ').trim()
        );

        cleanSnippets.forEach(cleanFrag => {
          snippets.push({
            id,
            fileName: filename,
            uploadedAt,
            content: cleanFrag
          });
        });
      }

      const duration = Date.now() - start;
      const hits = result.hits.hits;

      await logSearch({
        user: req.user.id,
        query: q,
        results: hits.length,
        duration
      });

      return cacheJSONResponse(req, res, snippets, { ttlSeconds: 86400 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors de la recherche PDF' });
    }
  }
);

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

    const { filePath, filename } = result._source;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.download(filePath, filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

// ---------- Ouvrir un PDF dans le navigateur ----------
app.get('/api/pdfs/:id/open', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.get({ index: 'pdfs', id });

    const { filePath, filename } = result._source;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
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

// ---------- 404 & erreurs ----------
app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

// ---------- Démarrage ----------
const PORT = process.env.PORT || 3000;
connectDB(process.env.MONGODB_URI)
  .then(() =>
    app.listen(PORT, () =>
      console.log(`API sur http://localhost:${PORT}`)
    )
  )
  .catch(err => {
    console.error('Échec connexion BDD', err);
    process.exit(1);
  });
