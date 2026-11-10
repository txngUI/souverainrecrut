# SouverainRecrut

## Présentation

SouverainRecrut est une plateforme web de gestion des recrutements destinée aux entreprises.

Elle permet de :

- gérer les candidats ;
- publier des offres d'emploi ;
- suivre les candidatures ;
- centraliser le processus de recrutement.

Ce projet est utilisé comme **projet fil rouge** des cours  DevOps.

---

## Livrables du module CI/CD (Backend)

> **Point d'entrée :** [`documentation/rapport-final.md`](documentation/rapport-final.md). Il commence par le schéma complet de la pipeline et liste tous les documents du livrable.

### Où trouver quoi

| Élément | Lien |
|---|---|
| Rapport final | [`documentation/rapport-final.md`](documentation/rapport-final.md) |
| Schéma de la pipeline | [`documentation/schemas/pipeline.png`](documentation/schemas/pipeline.png) |
| Architecture | [`documentation/architecture.md`](documentation/architecture.md) |
| Procédures de déploiement et de rollback | [`documentation/procedure-deploiement.md`](documentation/procedure-deploiement.md) · [`documentation/procedure-rollback.md`](documentation/procedure-rollback.md) |
| Gestion des secrets | [`documentation/gestion-des-secrets.md`](documentation/gestion-des-secrets.md) |
| Intégration continue (Jenkinsfile, lab, rapports) | [`integration-continue/`](integration-continue/) |
| Déploiement (Terraform, Ansible, Compose, GitLab CI) | [`deploiement/`](deploiement/) |

### Plateformes et services

| Plateforme | Lien | Accès |
|---|---|---|
| **GitLab : pipeline de déploiement** | https://gitlab.com/tanguy-cicd/souverainrecrut-deploiement | Projet **privé**, accès sur invitation (rôle *Reporter*). Son contenu est identique au dossier [`deploiement/`](deploiement/) de ce dépôt, publié avec `git subtree`. |
| Docker Hub : image de l'API | https://hub.docker.com/r/iamkrugs/souverainrecrut-backend | Public |
| Jenkins : intégration continue (VPS 2) | https://jenkins.tanguydavid.fr | Authentification requise |
| SonarQube : qualité du code (VPS 2) | https://sonar.tanguydavid.fr | Authentification requise |
| API en production (VPS 1) | https://api.tanguydavid.fr/v1/health · [Swagger](https://api.tanguydavid.fr/api-docs) | Public |

**Chaîne complète :** `git push` sur `Dev` (GitHub) → webhook → Jenkins sur le VPS 2 (tests, SonarQube, Quality Gate, Trivy) → image sur Docker Hub → pipeline GitLab → déploiement sur le VPS 1.

---

## Architecture

Le projet est composé de deux applications.

```
Frontend (React)
        │
        ▼
Backend (Express API)
        │
        ▼
PostgreSQL
```

---

## Stack technique

### Frontend

- React
- TypeScript
- Vite
- Axios
- Material UI

### Backend

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL

### DevOps

- Git
- GitLab
- Docker
- GitLab CI/CD
- Terraform
- Ansible
- Nginx

---

## Arborescence

```
souverainrecrut/
│
├── backend/
├── frontend/
├── docs/
└── README.md
```

---

## Auteur

ALIMOU DIALLO