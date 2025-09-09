import { Router } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'
import { logAuth } from '../utils/logger.js'
import { auth } from '../middleware/auth.js'
import { validateRegister, validateLogin } from '../validators/auth.js'

const router = Router()
const TOKEN_TTL = 60 * 60 * 24 * 7 // 7 jours
const SECRET = process.env.JWT_SECRET || 'dev-secret'

function signToken(userId) {
  return jwt.sign({}, SECRET, { subject: String(userId), expiresIn: TOKEN_TTL })
}

// POST /api/auth/register
router.post('/register', validateRegister, async (req, res) => {
  const { email, password, name } = req.body
  try {
    const exists = await User.findOne({ email })
    if (exists) return res.status(409).json({ error: 'Email déjà utilisé' })

    const hash = await bcrypt.hash(password, 12)
    const u = await User.create({ email, password: hash, name })
    const user = { id: u._id, email: u.email, name: u.name, createdAt: u.createdAt }
    const token = signToken(u._id)

    // --- AJOUT DU LOG DE CREATION ---
    await logAuth(u._id, 'creation')  // action "creation" pour nouvel utilisateur

    return res.status(201).json({ user, token })
  } catch (err) {
    // gestion des erreurs email unique
    if (err?.code === 11000) return res.status(409).json({ error: 'Email déjà utilisé' })
    console.error(err)
    return res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res) => {
  const { email, password } = req.body
  const u = await User.findOne({ email })
  if (!u) return res.status(401).json({ error: 'Identifiants invalides' })

  const ok = await bcrypt.compare(password, u.password)
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' })

  const user = { id: u._id, email: u.email, name: u.name, createdAt: u.createdAt }
  const token = signToken(u._id)

  // --- AJOUT DU LOG DE CONNEXION ---
  await logAuth(u._id, 'connexion')

  return res.json({ user, token })
})

// POST /api/auth/logout
router.post('/logout', auth, async (req, res) => {
  try {
    await logAuth(req.user.id, 'deconnexion');
    return res.json({ message: 'Déconnexion enregistrée' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router
