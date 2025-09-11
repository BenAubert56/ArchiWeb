import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const userMock = {
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
};
await jest.unstable_mockModule('../models/User.js', () => userMock);

const bcryptMock = {
  hash: jest.fn(),
  compare: jest.fn(),
};
await jest.unstable_mockModule('bcrypt', () => ({ default: bcryptMock }));

const jwtMock = {
  sign: jest.fn(),
};
await jest.unstable_mockModule('jsonwebtoken', () => ({ default: jwtMock }));

const loggerMock = {
  logAuth: jest.fn(),
};
await jest.unstable_mockModule('../utils/logger.js', () => loggerMock);

// court-circuiter les validateurs
await jest.unstable_mockModule('../validators/auth.js', () => ({
  validateRegister: (_req, _res, next) => next(),
  validateLogin: (_req, _res, next) => next(),
}));

// mock du middleware auth
await jest.unstable_mockModule('../middleware/auth.js', () => ({
  auth: (req, _res, next) => {
    req.user = { id: '507f1f77bcf86cd799439011' };
    next();
  },
}));

// >>> IMPORTANT: définir le secret AVANT d'importer le router
process.env.JWT_SECRET = 'test-secret';

// --- Import du router testé après les mocks et l'env ---
const { default: router } = await import('../routes/auth.js');

// Raccourcis vers les mocks
const { User } = userMock;
const bcrypt = bcryptMock;
const jwt = jwtMock;
const { logAuth } = loggerMock;

// App factory
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // optionnel: redéfinir pour chaque test
  process.env.JWT_SECRET = 'test-secret';
});

describe('POST /api/auth/register', () => {
  test('201 nouveau user', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_pw');
    const now = new Date('2024-01-01T00:00:00Z');
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      email: 'a@b.c',
      name: 'Ben',
      createdAt: now,
      password: 'hashed_pw',
    };
    User.create.mockResolvedValue(doc);
    jwt.sign.mockReturnValue('jwt_token');

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.c', password: 'pw', name: 'Ben' });

    expect(res.status).toBe(201);
    expect(User.findOne).toHaveBeenCalledWith({ email: 'a@b.c' });
    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 12);
    expect(User.create).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'hashed_pw',
      name: 'Ben',
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      {},
      'test-secret',
      expect.objectContaining({
        subject: '507f1f77bcf86cd799439011',
        expiresIn: 60 * 60 * 24 * 7,
      }),
    );
    expect(logAuth).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'creation');

    expect(res.body).toEqual({
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'a@b.c',
        name: 'Ben',
        createdAt: now.toISOString(),
      },
      token: 'jwt_token',
    });
  });

  test('409 exists', async () => {
    User.findOne.mockResolvedValue({ _id: 'x' });
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.c', password: 'pw', name: 'Ben' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email déjà utilisé' });
  });

  test('409 duplicate key 11000', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_pw');
    User.create.mockRejectedValue({ code: 11000 });
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.c', password: 'pw', name: 'Ben' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email déjà utilisé' });
  });

  test('500 erreur serveur', async () => {
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_pw');
    User.create.mockRejectedValue(new Error('db down'));
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.c', password: 'pw', name: 'Ben' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erreur serveur' });
  });
});

describe('POST /api/auth/login', () => {
  test('200 identifiants valides', async () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      email: 'a@b.c',
      name: 'Ben',
      createdAt: now,
      password: 'hashed_pw',
    };
    User.findOne.mockResolvedValue(doc);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('jwt_token');

    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.c', password: 'pw' });

    expect(res.status).toBe(200);
    expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hashed_pw');
    expect(jwt.sign).toHaveBeenCalled();
    expect(logAuth).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'connexion');
    expect(res.body).toEqual({
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'a@b.c',
        name: 'Ben',
        createdAt: now.toISOString(),
      },
      token: 'jwt_token',
    });
  });

  test('401 email inconnu', async () => {
    User.findOne.mockResolvedValue(null);
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'x@y.z', password: 'pw' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Identifiants invalides' });
  });

  test('401 mauvais mot de passe', async () => {
    User.findOne.mockResolvedValue({ _id: 'id', password: 'hash' });
    bcrypt.compare.mockResolvedValue(false);
    const app = makeApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.c', password: 'bad' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Identifiants invalides' });
  });
});

describe('POST /api/auth/logout', () => {
  test('200 et logAuth appelé', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/auth/logout').send();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Déconnexion enregistrée' });
    expect(logAuth).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'deconnexion');
  });

  test('500 si logAuth échoue', async () => {
    logAuth.mockRejectedValueOnce(new Error('logger down'));
    const app = makeApp();
    const res = await request(app).post('/api/auth/logout').send();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erreur serveur' });
  });
});
