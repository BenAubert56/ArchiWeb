export function validateRegister(req, res, next) {
  const { email, password, name } = req.body || {}
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide', message: 'Email invalide' })
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe ≥ 8 caractères', message: 'Mot de passe ≥ 8 caractères' })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Nom requis', message: 'Nom requis' })
  }
  next()
}

export function validateLogin(req, res, next) {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis', message: 'Email et mot de passe requis' })
  }
  next()
}
