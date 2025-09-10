import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import multer from 'multer';
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Client } from '@elastic/elasticsearch';

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

// Upload PDF
app.post('/api/pdfs/upload', upload.single('pdf'), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);

    const doc = {
      filename: req.file.originalname,
      content: pdfData.text,
      uploadedAt: new Date(),
      originalPath: req.file.path // chemin temporaire, à adapter si stockage central
    };

    await client.index({
      index: 'pdfs',
      document: doc
    });

    fs.unlinkSync(req.file.path);

    res.json({ message: 'PDF indexé avec succès', doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’upload PDF' });
  }
});

// Recherche PDF
app.get('/api/pdfs/search', async (req, res) => {
  try {
    const { q } = req.query;
    const result = await client.search({
      index: 'pdfs',
       _source: ['filename', 'uploadedAt'],
      query: {
        multi_match: {
          query: q,
          fields: ['filename', 'content']
        }
      }
    });

    res.json(result.hits.hits);
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
      _source: ['filename', 'uploadedAt'],
      size: 1000, // ajuster selon vos besoins
      query: { match_all: {} }
    });

    res.json(result.hits.hits);
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
