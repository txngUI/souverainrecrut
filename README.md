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

### Étapes réalisées

Chaque étape renvoie à sa documentation détaillée. Toutes les commandes exécutées sont regroupées dans l'[annexe A du rapport](documentation/rapport-final.md#annexe-a--commandes-exécutées).

#### Partie 1 : intégration continue (cahier des charges §3)

| # | Étape | Résultat | Détail |
|---|---|---|---|
| 1 | **Préparation du dépôt** : fork, clone, branche `Dev`, `npm ci`, `prisma generate` | Backend installable | [README CI §1](integration-continue/README.md) |
| 2 | **Tests automatisés** : Jest, ts-jest, supertest ; Prisma simulé ; tests unitaires et d'intégration (authentification, rôles, candidats, offres, candidatures, santé) | **110 tests, couverture de 100 %**, seuil bloquant à 80 %, rapport `lcov.info` | [README CI §2](integration-continue/README.md) · [rapport](integration-continue/reports/) |
| 3 | **Qualité du code** : ESLint et Prettier | Lint et formatage vérifiés dans la pipeline | [README CI §3](integration-continue/README.md) |
| 4 | **Lab local** : Jenkins + SonarQube + PostgreSQL en Docker Compose | Lab validé sur le poste de travail | [README CI §4](integration-continue/README.md) |
| 5 | **Analyse SonarQube** et Quality Gate, avec correction des issues (en-tête `X-Powered-By`, `Number.parseInt`) | Quality Gate **Passed**, 0 bug, 0 vulnérabilité, 0 code smell | [README CI §5](integration-continue/README.md) · [exports](integration-continue/sonar/) |
| 6 | **Dockerfile** revu : Node 22, multi-stage, utilisateur non-root, healthcheck, sans npm, `.dockerignore` | Image légère et sans secret | [rapport §7](documentation/rapport-final.md) |
| 7 | **Scan Trivy**, avec une politique explicite : blocage des HIGH/CRITICAL corrigeables ; exception justifiée et datée | 1 CRITICAL et 26 HIGH au départ, **0 CRITICAL** après correction | [rapport Trivy](integration-continue/reports/) |
| 8 | **Jenkins** : credentials (`sonar-token`, `dockerhub`), serveur SonarQube, webhook Quality Gate, job sur `Dev`, [`Jenkinsfile`](integration-continue/Jenkinsfile) versionné | Pipeline verte : tests → SonarQube → Quality Gate → image → Trivy → publication | [rapport §6](documentation/rapport-final.md) |
| 9 | **Publication sur Docker Hub** : tags `1.0.0-<sha7>` et `sha-<sha7>`, labels OCI, jamais `latest` | Image traçable jusqu'au commit | [Docker Hub](https://hub.docker.com/r/iamkrugs/souverainrecrut-backend) |
| 10 | **Contrôle des secrets** : inventaire, scan gitleaks | `no leaks found` ; aucun `.env` réel versionné | [gestion des secrets](documentation/gestion-des-secrets.md) |

#### Partie 2 : provisionnement et déploiement (cahier des charges §4 et §5)

| # | Étape | Résultat | Détail |
|---|---|---|---|
| 11 | **Serveur de production (VPS 1)** à la place d'une VM VMware (joignable par GitLab, exposition réelle) ; sauvegarde de configuration à la place du snapshot | Point de restauration avant toute modification | [README déploiement §1](deploiement/README.md) |
| 12 | **Terraform** (provider Hostinger) : DNS `api.tanguydavid.fr` (A + AAAA) | `2 to add, 0 to change, 0 to destroy`, puis `Apply complete` | [README déploiement §2](deploiement/README.md) |
| 13 | **Accès SSH** : clé d'administration (Ansible) et clé de déploiement dédiée (GitLab, compte `souverainrecrut` sans sudo) | Rôles séparés | [README déploiement §3](deploiement/README.md) |
| 14 | **Ansible** (`playbook.yml`) : dépendances, Docker, compte de déploiement, répertoire, site Caddy en HTTPS ; simulation `--check` avant application | `failed=0`, puis `changed=0` à la 2e exécution (idempotence) | [README déploiement §4](deploiement/README.md) |
| 15 | **Docker Compose** : API + PostgreSQL, volume persistant, réseau interne, healthchecks, migrations Prisma dans un conteneur dédié ; testé en local avant déploiement | API en ligne : `https://api.tanguydavid.fr/v1/ready` → `READY / CONNECTED` | [README déploiement §5](deploiement/README.md) |
| 16 | **Pipeline GitLab** ([`.gitlab-ci.yml`](deploiement/.gitlab-ci.yml)) : validation du tag, SSH, sauvegarde de la base, pull, migrations, démarrage, **retour automatique en cas d'échec**, vérification de l'API | Déploiement réussi par la pipeline | [README déploiement §6](deploiement/README.md) |
| 17 | **Incident de sécurité traité** : clé de déploiement exposée dans une capture, puis révoquée et renouvelée (Ansible en mode exclusif) | Ancienne clé révoquée, empreinte vérifiée | [gestion des secrets §4.1](documentation/gestion-des-secrets.md) |
| 18 | **Procédures** de déploiement et de rollback (restauration de la base testée) | Reproductibles par un tiers | [déploiement](documentation/procedure-deploiement.md) · [rollback](documentation/procedure-rollback.md) |

#### Partie 3 : serveur d'intégration continue dédié (deux VPS)

| # | Étape | Résultat | Détail |
|---|---|---|---|
| 19 | **Terraform** : DNS `jenkins` et `sonar` vers le VPS 2 | `4 to add, 0 to change, 0 to destroy` | [README déploiement §7](deploiement/README.md) |
| 20 | **Ansible** (`playbook-ci.yml`) : Docker, pare-feu (22, 80, 443), Caddy en HTTPS, limites mémoire | `failed=0` | [README CI §8](integration-continue/README.md) |
| 21 | **Migration** du lab local vers le VPS 2 (volumes Docker) ; Docker Hub authentifié (quota anonyme partagé épuisé) | Job, credentials, projet SonarQube et Quality Gate conservés | [rapport §5](documentation/rapport-final.md) |
| 22 | **Webhook GitHub → Jenkins** (`githubPush()`) | Build lancé dès le push : *« Started by GitHub push »* | [rapport §5](documentation/rapport-final.md) |
| 23 | **Documentation** : rapport avec schéma, architecture des deux VPS, captures | CI séparée de la production, reliées uniquement par Docker Hub | [architecture](documentation/architecture.md) |

---

## Architecture

> Architecture de la chaîne CI/CD (deux VPS, Jenkins, GitLab, Docker Hub) : voir [`documentation/architecture.md`](documentation/architecture.md) et le [schéma de la pipeline](documentation/schemas/pipeline.png).

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

### DevOps (module CI/CD)

- **Code et dépôts :** Git, GitHub (code, webhook), GitLab (pipeline de déploiement)
- **Qualité :** Jest, ts-jest, supertest, ESLint, Prettier, SonarQube
- **Intégration continue :** Jenkins (Jenkinsfile), Docker, Trivy, Docker Hub
- **Infrastructure :** Terraform (provider Hostinger, DNS), Ansible
- **Déploiement :** GitLab CI/CD, Docker Compose, PostgreSQL, Caddy (HTTPS)
- **Sécurité :** gitleaks, credentials Jenkins, variables GitLab protégées

---

## Arborescence

```
souverainrecrut/
├── backend/                 # API (code, tests, Dockerfile, sonar-project.properties)
├── frontend/                # hors périmètre du module CI/CD
├── integration-continue/    # Jenkinsfile, lab Jenkins + SonarQube, rapports, exports Sonar
├── deploiement/             # Terraform, Ansible, Docker Compose, .gitlab-ci.yml (publié sur GitLab)
├── documentation/           # rapport, architecture, procédures, secrets, schéma, captures
└── README.md
```

---

## Auteurs

- Projet d'origine : ALIMOU DIALLO
- Industrialisation CI/CD (Backend) : Tanguy D.