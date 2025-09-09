import jwt from 'jsonwebtoken'

export function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Token manquant' })

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { id: payload.sub }
    next()
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' })
  }
}
