import { jest } from '@jest/globals';
import request from 'supertest';
import stream from 'stream';
import express from 'express';

// DB
await jest.unstable_mockModule('../db.js', () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

// Auth: injecte un user
await jest.unstable_mockModule('../middleware/auth.js', () => ({
  auth: (req, _res, next) => {
    req.user = { id: 'u1' };
    next();
  },
}));

// Cache
const cacheJSONResponse = jest.fn((req, res, body) => res.json(body));
const bumpCacheVersion = jest.fn().mockResolvedValue(undefined);
const clearCache = jest.fn().mockResolvedValue(undefined);
await jest.unstable_mockModule('../cache.js', () => ({
  cacheMiddleware: () => (_req, _res, next) => next(),
  cacheJSONResponse,
  bumpCacheVersion,
  clearCache,
}));

// Logger
await jest.unstable_mockModule('../utils/logger.js', () => ({
  logSearch: jest.fn(),
  logUpload: jest.fn(),
  logListDocs: jest.fn(),
}));

// Multer: simule single('pdf') en posant req.file
await jest.unstable_mockModule('multer', () => ({
  default: () => ({
    single: () => (req, _res, next) => {
      req.file = { path: 'uploads/tmp123.pdf', originalname: 'test.pdf', size: 1234 };
      next();
    },
  }),
}));

// FS
const fsMock = {
  existsSync: jest.fn().mockReturnValue(false),
  renameSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('%PDF-1.4')),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn(() => {
    const s = new stream.PassThrough();
    setImmediate(() => s.end('PDFDATA'));
    return s;
  }),
  mkdirSync: jest.fn(),
};
await jest.unstable_mockModule('fs', () => ({ default: fsMock }));

// pdf-parse (si utilisé quelque part)
await jest.unstable_mockModule('pdf-parse/lib/pdf-parse.js', () => ({
  default: jest.fn().mockResolvedValue({
    text: 'Bonjour elasticsearch. Bonjour pdf. Auteur X.',
    info: { Author: 'Auteur X', CreationDate: '2024-01-01' },
  }),
}));

// stopword
await jest.unstable_mockModule('stopword', () => ({
  default: { fra: ['de', 'la', 'le', 'et', 'un', 'une', 'les', 'du'] },
}));

// Elasticsearch Client
const searchMock = jest.fn();
const indexMock = jest.fn();
const getMock = jest.fn();
const refreshMock = jest.fn();
await jest.unstable_mockModule('@elastic/elasticsearch', () => ({
  Client: class {
    constructor() {
      this.search = searchMock;
      this.index = indexMock;
      this.get = getMock;
      this.indices = { refresh: refreshMock };
    }
  },
}));

// SearchLog (mongoose-like chain)
const distinctMock = jest.fn().mockResolvedValue(['budget 2024', 'contrat cadre']);
const findChain = {
  sort: () => findChain,
  limit: () => findChain,
  distinct: distinctMock,
};
await jest.unstable_mockModule('../models/Logs.js', () => ({
  SearchLog: { find: jest.fn().mockReturnValue(findChain) },
}));

// Router /api/auth (pas utilisé ici, stub simple)
await jest.unstable_mockModule('../routes/auth.js', () => ({
  default: express.Router(),
}));

// ---- Mock pdfUtils pour éviter pdfjs/canvas en CI ----
await jest.unstable_mockModule('../utils/pdfUtils.js', () => ({
  extractPagesText: jest.fn().mockResolvedValue([
    { pageNumber: 1, text: 'Bonjour elasticsearch. Bonjour pdf. Auteur X.' },
  ]),
}));

// Env avant import
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// ----- Import de l'app APRÈS mocks -----
const { default: app } = await import('../server.js');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret';
  // par défaut, pas de doublon pour upload
  searchMock.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
  indexMock.mockResolvedValue({ _id: 'doc1' });
  refreshMock.mockResolvedValue({});
  getMock.mockResolvedValue({ _source: { filePath: 'stored_pdfs/x.pdf', filename: 'x.pdf' } });
  fsMock.existsSync.mockReturnValue(false); // download/open -> 404
});

// ---- Tests ----

test('GET / renvoie statut service', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, service: 'Service API' });
});

test('POST /api/pdfs/upload indexe un PDF', async () => {
  const res = await request(app).post('/api/pdfs/upload').set('Authorization', 'Bearer x');
  expect(res.status).toBe(200);
  expect(indexMock).toHaveBeenCalledWith(
    expect.objectContaining({
      index: 'pdfs',
      document: expect.objectContaining({
        filename: expect.stringContaining('.pdf'),
        contentHash: expect.any(String),
        tags: expect.any(Array),
        uploadedAt: expect.any(Date),
        originalPath: expect.stringContaining('stored_pdfs'),
      }),
    }),
  );
  expect(refreshMock).toHaveBeenCalledWith({ index: 'pdfs' });
  expect(bumpCacheVersion).toHaveBeenCalled();
  expect(res.body).toEqual(expect.objectContaining({ message: 'PDF indexé avec succès', id: 'doc1' }));
});

test('POST /api/pdfs/upload détecte un doublon (409)', async () => {
  searchMock.mockResolvedValueOnce({ hits: { hits: [{ _id: 'dup' }] } });
  const res = await request(app).post('/api/pdfs/upload').set('Authorization', 'Bearer x');
  expect(res.status).toBe(409);
  expect(res.body).toEqual({ error: 'Fichier déjà indexé' });
});

test('GET /api/pdfs/search retourne items formatés', async () => {
  searchMock.mockResolvedValueOnce({
    hits: {
      total: { value: 42 },
      hits: [
        {
          _id: 'id1',
          _source: { filename: 'f1.pdf', uploadedAt: '2024-02-01' },
          inner_hits: {
            pages_matching: {
              hits: {
                hits: [
                  {
                    _source: { pageNumber: 5 },
                    highlight: { 'pages.text': ['foo <mark>bar</mark> baz'] },
                  },
                ],
              },
            },
          },
        },
      ],
    },
  });
  const res = await request(app)
    .get('/api/pdfs/search?q=bar&page=1')
    .set('Authorization', 'Bearer x');
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(42);
  expect(res.body.hits[0]).toEqual(
    expect.objectContaining({
      id: 'id1',
      fileName: 'f1.pdf',
      uploadedAt: '2024-02-01',
      snippets: [{ pageNumber: 5, snippet: 'foo <mark>bar</mark> baz' }],
    }),
  );
});

test('GET /api/pdfs liste 200', async () => {
  searchMock.mockResolvedValueOnce({
    hits: { hits: [{ _id: 'a', _source: { filename: 'a.pdf', tags: [], uploadedAt: '2024-01-01' } }] },
  });
  const res = await request(app).get('/api/pdfs').set('Authorization', 'Bearer x');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(1);
});

test('DELETE /api/cache vide le cache', async () => {
  const res = await request(app).delete('/api/cache').set('Authorization', 'Bearer x');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ success: true, message: 'Cache vidé' });
  expect(clearCache).toHaveBeenCalled();
});

test('GET /api/pdfs/:id/download renvoie 404 si fichier absent', async () => {
  const res = await request(app).get('/api/pdfs/abc/download').set('Authorization', 'Bearer x');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Fichier introuvable' });
});

test('GET /api/pdfs/:id/open renvoie 404 si fichier absent', async () => {
  const res = await request(app).get('/api/pdfs/abc/open').set('Authorization', 'Bearer x');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Fichier introuvable' });
});

test('GET /api/pdfs/suggestions retourne suggestions', async () => {
  const res = await request(app).get('/api/pdfs/suggestions?q=bu').set('Authorization', 'Bearer x');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(['budget 2024', 'contrat cadre']);
});
