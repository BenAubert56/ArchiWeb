import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Client } from '@elastic/elasticsearch';
import { logSearch, logUpload, logListDocs } from './utils/logger.js';
import sw from 'stopword';

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

const upload = multer({ dest: 'uploads/' });
const stopwords = new Set(sw.fra);

// fonction pour extraire les tags en enlevant les pronoms 
function extractTags(text, limit = 20) {
  // Nettoyer le texte et séparer les mots
  const words = text
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñæœ\s]/gi, ' ') // supprimer les caractères spéciaux
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  // Compter la fréquence d'aparition
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  return sorted.slice(0, limit).map(([word]) => word);
}

// Fonction pour vérifier si un document existe déjà
async function docExists({ filename, content, author, size, createdAt }) {
  // récupérer tous les docs avec le même filename
  const result = await client.search({
    index: 'pdfs',
    size: 100, // ajuster selon le nombre de fichiers avec le même nom
    query: {
      term: { 'filename.keyword': filename }
    }
  });

  // comparer côté Node.js
  for (const hit of result.hits.hits) {
    const doc = hit._source;

    if (
      doc.content === content &&
      doc.author === author &&
      doc.size === size &&
      doc.createdAt === createdAt
    ) {
      return true;
    }
  }

  return false;
}

// Upload PDF
app.post('/api/pdfs/upload', upload.single('pdf'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);

    const metadata = {
      filename: req.file.originalname,
      content: pdfData.text,
      author: pdfData.info?.Author || 'unknown',
      size: req.file.size,
      createdAt: pdfData.info?.CreationDate || null
    };

    // Vérifier via docExists
    const exists = await docExists(metadata);
    if (exists) {
      fs.unlinkSync(req.file.path);
      return res.status(409).json({ error: 'Fichier déjà indexé' });
    }

    // Extraction des tags
    const tags = extractTags(pdfData.text);
    
    // sinon indexer le document
    const doc = {
      ...metadata,
      tags,
      uploadedAt: new Date(),
      originalPath: req.file.path
    };

    await client.index({
      index: 'pdfs',
      document: doc
    });

    // Log de l’upload
    await logUpload({
      user: req.user?.id || 'anonymous',
      filename: req.file.originalname,
      tags,
      size: req.file.size
    });

    fs.unlinkSync(req.file.path);

    res.json({ message: 'PDF indexé avec succès', doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'upload PDF" });
  }
});

// Recherche PDF
app.get('/api/pdfs/search', async (req, res) => {
  try {
    const { q, userId } = req.query;
    const start = Date.now();

    if (!q) return res.status(400).json({ error: 'La query est vide' });

    const result = await client.search({
      index: 'pdfs',
      _source: ['filename', 'uploadedAt'],
      query: {
        bool: {
          should: [
            { term: { 'filename.keyword': { value: q, boost: 3 } } },
            { terms: { 'tags': q.split(' '), boost: 2 } },
            {
              multi_match: {
                query: q,
                fields: ['content'],
                type: 'best_fields'
              }
            }
          ]
        }
      }
    });

    const duration = Date.now() - start;
    const hits = result.hits.hits;

    // journalisation de la recherche
    await logSearch({
      user: userId || 'anonymous',
      query: q,
      results: hits.length,
      duration
    });

    res.json(hits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la recherche PDF' });
  }
});


// Lister tous les PDFs indexés
app.get('/api/pdfs', async (req, res) => {
  try {
    const result = await client.search({
      index: 'pdfs',
      _source: ['filename', 'uploadedAt', 'tags'],
      size: 1000,
      query: { match_all: {} }
    });

    const hits = result.hits.hits;

    await logListDocs({
      user: req.user?.id || 'anonymous',
      results: hits.length
    });

    res.json(hits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des PDFs' });
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
