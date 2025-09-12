# Projet Express

## Prérequis
- [Node.js](https://nodejs.org) (version 18+ recommandée)
- npm (installé avec Node.js)
- Docker

Vérifiez votre installation :
```bash
node -v
npm -v
```

## Docker 
### Lancer le conteneur maître (serveur)
```bash
docker compose -f docker-compose.server.yml -p server up -d
```

### Lancer le conteneur esclave (cluster / nodes)
```bash
docker compose -f docker-compose.cluster.yml -p cluster up -d
```


# MongoDB 
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
