# Projet Express

## Prérequis
- [Node.js](https://nodejs.org) (version 18+ recommandée)
- npm (installé avec Node.js)

Vérifiez votre installation :
```bash
node -v
npm -v
```

## Installation 
```bash
git clone https://github.com/BenAubert56/ArchiWeb.git
```

```bash
cd ArchiWeb/back
```

```bash
npm install
```

```bash
npm start
```

# Lancer MongoDB 
Se connecter en root
```bash
docker exec -it mongo mongosh -u root -p root --authenticationDatabase admin
use google-like
```

Se connecter avec le user pdfuser
```bash
docker exec -it mongo mongosh -u pdfuser -p pdfpassword --authenticationDatabase google-like
use google-like
```