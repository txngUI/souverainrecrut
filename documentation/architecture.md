# Architecture — Chaîne CI/CD SouverainRecrut

**Périmètre :** API Backend SouverainRecrut (Node.js 22, Express, TypeScript, Prisma, PostgreSQL). Le frontend est hors périmètre.
**Principe :** une modification du code devient une image Docker testée, analysée, scannée et versionnée. Cette image, et seulement elle, est ensuite déployée en production. Elle n'est jamais reconstruite au déploiement.

## 1. Vue d'ensemble

```
 ┌──────────────┐  git push (Dev)   ┌──────────────────────────────────────────────────────┐
 │ Développeur  │──────────────────▶│ GitHub : txngUI/souverainrecrut                      │
 └──────────────┘                   └──────────────────────────────────────────────────────┘
                                           │ Poll SCM (5 min)               │ git subtree push
                                           ▼                                ▼  (dossier deploiement/)
 ┌──────────── INTÉGRATION CONTINUE : lab local (Docker Compose) ─┐  ┌───────────────────────────┐
 │                                                                 │  │ GitLab.com                │
 │  Jenkins ──analyse──▶ SonarQube ──▶ PostgreSQL (sonar-db)       │  │ tanguy-cicd/              │
 │    ▲  ◀──webhook Quality Gate──┘                                │  │ souverainrecrut-deploiement│
 │    │                                                            │  │                           │
 │    └─▶ Docker de l'hôte : build de l'image + scan Trivy         │  │ Pipeline (manuelle,       │
 │                                                                 │  │ input backend_tag)        │
 └───────────────────────────────┬─────────────────────────────────┘  │ validate → deploy → verify│
                                 │ docker push (si tout est vert)     └─────────────┬─────────────┘
                                 ▼                                                  │ SSH (clé dédiée)
              ┌──────────────────────────────────────────┐   docker pull            │
              │ Docker Hub : iamkrugs/souverainrecrut-   │◀─────────────────────────┐│
              │ backend:<version>-<sha7>                 │                          ││
              └──────────────────────────────────────────┘                          ▼▼
 ┌──────────── DÉPLOIEMENT : VPS Ubuntu 24.04 (préparé par Ansible) ───────────────────────────┐
 │                                                                                              │
 │  Internet ──HTTPS 443──▶ Caddy (conteneur existant, certificat Let's Encrypt)               │
 │                              │ réseau Docker « web »                                        │
 │                              ▼                                                              │
 │                    souverainrecrut-api:4000 ──réseau interne « backend »──▶ PostgreSQL 17   │
 │                    (conteneur API)          ▲                               (volume db_data) │
 │                    migrate (prisma migrate deploy, ponctuel) ┘                               │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲
        │ DNS api.tanguydavid.fr (A + AAAA) géré par Terraform (provider Hostinger)
```

## 2. Composants et rôles

| Composant | Où | Rôle |
|---|---|---|
| **GitHub** | github.com | Source de vérité du code et des livrables. La branche `Dev` déclenche l'intégration continue. |
| **Jenkins** | Lab local, Docker Compose (`integration-continue/lab/`) | Orchestration de la CI à partir du `Jenkinsfile` versionné |
| **SonarQube** + PostgreSQL | Lab local | Analyse statique et Quality Gate (*Sonar way*) |
| **Trivy** | Conteneur lancé par Jenkins | Scan des vulnérabilités de l'image avant publication |
| **Docker Hub** | hub.docker.com | Registre de l'image versionnée ; point de passage entre la CI et le déploiement |
| **Terraform** | Poste d'administration → API Hostinger | Enregistrements DNS `api.tanguydavid.fr` (A, AAAA) |
| **Ansible** | Poste d'administration → VPS (SSH root par clé) | Préparation idempotente du serveur : dépendances, Docker, compte de déploiement, site Caddy |
| **GitLab CI/CD** | GitLab.com (runners hébergés) | Déploiement d'un tag d'image sur le serveur, vérification, retour arrière automatique |
| **Caddy** | VPS, conteneur existant | Reverse proxy HTTPS, certificat automatique |
| **API** | VPS, conteneur `api` | Service applicatif, sans port publié |
| **PostgreSQL 17** | VPS, conteneur `db` | Base de données, volume persistant `db_data`, réseau interne uniquement |

## 3. Flux : de la modification du code à l'API déployée

| # | Étape | Outil | Barrière |
|---|---|---|---|
| 1 | `git push` sur `Dev` | Git / GitHub | — |
| 2 | Détection du commit (≤ 5 min) | Jenkins (*Poll SCM*) | — |
| 3 | `npm ci`, `prisma generate`, ESLint, Prettier | Jenkins | Lint ou formatage en échec |
| 4 | Tests + couverture | Jest, supertest | Test rouge ou couverture < 80 % |
| 5 | Analyse et Quality Gate | SonarQube | Gate rouge |
| 6 | Build de l'image `1.0.0-<sha7>` | Docker | Build en échec |
| 7 | Scan de l'image | Trivy | HIGH/CRITICAL corrigeable non justifiée |
| 8 | Publication | Docker Hub | (seulement si 3 à 7 sont verts) |
| 9 | Lancement du déploiement avec ce tag | GitLab (*New pipeline*) | Tag invalide ou absent de Docker Hub |
| 10 | Sauvegarde de la base, pull, migrations, démarrage | GitLab → SSH → Docker Compose | Migration ou healthcheck en échec : **retour automatique au tag précédent** |
| 11 | Vérification publique `/v1/ready` | GitLab | API non `READY` |

**Traçabilité :** le tag `<version>-<sha7>` et les labels OCI (`revision`, `version`, `source`) relient l'image déployée au commit exact. Côté serveur, `deploy-history.log` et l'environnement GitLab `production` conservent l'historique des versions déployées.

## 4. Réseau et exposition

| Élément | Exposition |
|---|---|
| Jenkins, SonarQube | `127.0.0.1` du poste local uniquement |
| API | Aucun port publié ; joignable par Caddy via le réseau Docker `web` (alias `souverainrecrut-api`) |
| PostgreSQL | Réseau Docker `backend` **interne** (sans accès Internet) ; injoignable depuis `web` (vérifié) |
| Accès public | `https://api.tanguydavid.fr` (443, TLS Let's Encrypt) via Caddy |
| Administration | SSH : `root` par clé (Ansible), `souverainrecrut` par clé dédiée, sans sudo (GitLab) |

Le serveur héberge d'autres services (sites, Minecraft). Le déploiement en est isolé :
- projet Compose dédié (`/opt/souverainrecrut`) ;
- fichier Caddy dédié ;
- compte dédié ;
- aucun port ouvert ;
- le service Docker n'est jamais redémarré.

## 5. Secrets

| Secret | Emplacement |
|---|---|
| Tokens SonarQube et Docker Hub (CI) | Credentials Jenkins (masqués dans les logs) |
| Token API Hostinger | Saisi à la demande dans le shell (`HOSTINGER_API_TOKEN`) |
| Clé SSH de déploiement | Variable GitLab de type *File*, protégée ; clé publique gérée par Ansible (mode exclusif) |
| `POSTGRES_PASSWORD`, `JWT_SECRET` | **Uniquement sur le serveur** (`/opt/souverainrecrut/.env`, droits 600), générés sur place |

Aucun secret n'est présent dans le dépôt, les images ou les logs (scan gitleaks : `no leaks found`). Inventaire et procédures : [`gestion-des-secrets.md`](gestion-des-secrets.md).

## 6. Choix techniques

| Choix | Justification |
|---|---|
| Image construite **une fois** (Jenkins), déployée telle quelle (GitLab) | Ce qui est testé et scanné est exactement ce qui tourne en production |
| CI (Jenkins) et CD (GitLab) séparées, dépôt de déploiement dédié | Responsabilités distinctes ; le déploiement ne dépend que d'un tag publié (orchestration multi-dépôts vue en cours) |
| Tag `<version>-<sha7>`, jamais `latest` | Traçabilité et rollback déterministe |
| VPS plutôt que VM VMware locale | Joignable par les runners GitLab.com ; exposition réelle (DNS, TLS) |
| Terraform limité au DNS | L'hébergeur du VPS n'a pas de provider ; la zone DNS (Hostinger) en a un officiel |
| Migrations dans un conteneur ponctuel `migrate` | `prisma migrate deploy` est exécuté avant l'API, qui ne démarre que s'il réussit |
| Sauvegarde `pg_dump` avant chaque déploiement | Permet de revenir en arrière même après une migration |
| Ansible idempotent et non destructif | Serveur partagé : aucune mise à jour complète ni redémarrage de Docker ; simulation `--check` avant application |
