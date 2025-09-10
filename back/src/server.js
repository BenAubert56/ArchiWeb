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
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

// Mongo + auth
app.get('/', (req, res) => res.json({ ok: true, service: 'Service API' }));
app.use('/api/auth', authRoutes);

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

/**
 * Ajouter de nouveaux fichiers index dans elastic search
 */
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
      filename: req.file.originalname,
      content: pdfData.text,
      uploadedAt: new Date(),
      filePath: storedFilePath
    };

    const response = await client.index({
      index: 'pdfs',
      document: doc
    });

    res.json({ message: 'PDF indexé avec succès', id: response._id, doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l’upload PDF' });
  }
});

/**
 * Recherche un document PDF
 */
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

/**
 * Lister tout les documents PDF
 */
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

/**
 * Télécharger PDF dans le navigateur
 */
app.get('/api/pdfs/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.get({ index: 'pdfs', id });

    const { filePath, filename } = result._source;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    res.download(filePath, filename);  // garde le nom original pour le téléchargement
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du téléchargement du PDF' });
  }
});

/**
 * Ouvrir PDF dans le navigateur
 */
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

app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
connectDB(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`API sur http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Échec connexion BDD', err);
    process.exit(1);
  });
