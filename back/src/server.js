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
import {cacheMiddleware, cacheJSONResponse, bumpCacheVersion, clearCache} from './cache.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// Mongo + auth
app.get('/', (req, res) => res.json({ ok: true, service: 'Service API' }));
app.use('/api/auth', authRoutes);

// ---------- Elasticsearch Cluster Setup ----------
const client = new Client({
  nodes: [
    'http://10.104.126.159:9200',
    'http://10.104.126.129:9200',
    'http://10.104.126.60:9200',
    'http://10.104.126.189:9200',
    'http://10.104.126.67:9200',
  ]
});

// Dossier de stockage permanent
const STORAGE_DIR = path.join(process.cwd(), 'stored_pdfs');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR);
}

const upload = multer({ dest: 'uploads/' });

// ---------- Upload PDF & Index ----------
app.post('/api/pdfs/upload', upload.single('pdf'), async (req, res) => {
  try {
    // Générer un nom unique pour le fichier
    const uniqueName = `${Date.now()}-${uuidv4()}-${req.file.originalname}`;
    const storedFilePath = path.join(STORAGE_DIR, uniqueName);
    fs.renameSync(req.file.path, storedFilePath);

    // Extraire le texte du PDF
    const dataBuffer = fs.readFileSync(storedFilePath);
    const pdfData = await pdfParse(dataBuffer);

    // Document Elasticsearch
    const doc = {
      filename: req.file.originalname,  // nom original
      content: pdfData.text,
      uploadedAt: new Date(),
      filePath: storedFilePath
    };

    const response = await client.index({
      index: 'pdfs',
      document: doc
    });

    // Rafraîchir l'index pour que le document soit immédiatement cherchable
    await client.indices.refresh({ index: 'pdfs' });

    // Invalidation du cache
    await bumpCacheVersion();

    res.json({ message: 'PDF indexé avec succès', id: response._id, doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’upload PDF' });
  }
});

// Recherche PDF (avec cache en lecture + écriture)
// Recherche PDF
app.get('/api/pdfs/search',
    cacheMiddleware({ ttlSeconds: 86400 }),
    async (req, res) => {
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
            multi_match: {
              query,
              fields: ['filename^2', 'content']
            }
          },
          highlight: {
            fields: {
              content: {
                fragment_size: 140,
                number_of_fragments: 10,
                pre_tags: ['<mark>'],
                post_tags: ['</mark>'],
                fragmenter: 'simple' // Meilleur découpage
              }
            }
          }
        });

        const snippets = [];
        for (const hit of result.hits.hits) {
          const id = hit._id;
          const { filename, uploadedAt } = hit._source || {};
          const contentFragments = hit.highlight?.content || [];

          const cleanSnippets = contentFragments.map(frag => {
            // Nettoyage des fragments
            return frag
                .replace(/-\s*/g, '')       // Supprime les tirets résiduels
                .replace(/\s+/g, ' ')       // Normalisation des espaces
                .trim();                    // Nettoie les espaces inutiles
          });

          cleanSnippets.forEach(cleanFrag => {
            snippets.push({
              id,
              fileName: filename,
              uploadedAt,
              content: cleanFrag
            });
          });
        }

        return cacheJSONResponse(req, res, snippets, { ttlSeconds: 86400 });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur lors de la recherche PDF' });
      }
    }
);

// Lister tous les PDFs indexés (avec cache)
app.get('/api/pdfs',
  cacheMiddleware({ ttlSeconds: 84000 }), // TTL plus long pour le listing
  async (req, res) => {
    try {
      const result = await client.search({
        index: 'pdfs',
        _source: ['filename', 'uploadedAt'],
        size: 1000, // ajuster selon vos besoins
        query: { match_all: {} }
      });

      const body = result.hits.hits;
      return cacheJSONResponse(req, res, body, { ttlSeconds: 86400 });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur lors de la récupération des PDFs' });
    }
  }
);

app.delete('/api/cache', async (req, res) => {
  try {
    await clearCache();
    res.json({ success: true, message: 'Cache vidé' });
  } catch (err) {
    res.status(500).json({ success: false, error: `Impossible de vider le cache: ${err}` });
  }
});

// ---------- Télécharger un PDF ----------
app.get('/api/pdfs/:id/download', async (req, res) => {
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
app.get('/api/pdfs/:id/open', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.get({ index: 'pdfs', id });

    const { filePath, filename } = result._source;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’ouverture du PDF' });
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
  .then(() => app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Échec connexion BDD', err);
    process.exit(1);
  });
