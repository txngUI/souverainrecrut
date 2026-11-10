# Architecture — Chaîne CI/CD SouverainRecrut

**Périmètre :** API Backend SouverainRecrut (Node.js 22, Express, TypeScript, Prisma, PostgreSQL). Le frontend est hors périmètre.
**Principe :** une modification du code devient une image Docker testée, analysée, scannée et versionnée. Cette image, et seulement elle, est ensuite déployée en production. Elle n'est jamais reconstruite au déploiement.

## 1. Deux serveurs séparés : intégration continue et production

La chaîne repose sur **deux VPS distincts**, conformément à la bonne pratique qui consiste à **séparer l'environnement qui construit le logiciel de celui qui l'exécute** :

| Serveur | Rôle | Contenu |
|---|---|---|
| **VPS 2 — intégration continue** (`185.216.25.110`) | Construire, tester, analyser, publier | Jenkins, SonarQube + PostgreSQL, Caddy (HTTPS). Joignable sur `jenkins.tanguydavid.fr` et `sonar.tanguydavid.fr`. |
| **VPS 1 — production** (`45.155.170.40`) | Exécuter l'API | API + PostgreSQL (Docker Compose), derrière le reverse proxy Caddy du serveur. Joignable sur `api.tanguydavid.fr`. |

**Les deux serveurs interagissent sans se connaître :** il n'existe **aucun lien direct** entre eux. Le serveur de CI n'a ni accès SSH ni identifiant pour la production. Ils communiquent par deux intermédiaires :
- **Docker Hub**, pour l'**image** : le VPS 2 la publie, le VPS 1 la récupère ;
- **GitLab**, pour l'**ordre de déploiement** : le VPS 2 déclenche la pipeline avec un jeton limité à ce projet, et c'est GitLab qui se connecte au VPS 1.

| Bénéfice | Explication |
|---|---|
| **Sécurité (moindre privilège)** | Jenkins exécute du code et pilote Docker, donc il dispose de droits élevés sur sa machine. Compromettre la CI ne donne **aucun accès** à la production ni à ses données. |
| **Isolation des ressources** | Les builds (npm, tests, analyse, construction d'image) consomment CPU, RAM et disque sur le VPS 2, sans jamais ralentir l'API en production. |
| **Indépendance** | La CI peut être arrêtée, mise à jour ou reconstruite sans interrompre la production, et inversement. Une version déjà publiée reste déployable même si la CI est indisponible. |
| **Traçabilité** | Ce qui passe de la CI à la production se résume à un tag d'image immuable et à l'ordre de le déployer : on sait exactement quelle version a quitté la CI et laquelle tourne en production. |

## 2. Vue d'ensemble

```
                       ┌────────────────────────────────────────────┐
  Développeur ─push──▶ │ GitHub : txngUI/souverainrecrut (Dev)      │
                       └────────────────────────────────────────────┘
                            │ webhook HTTPS                 │ git subtree push
                            ▼ (à chaque push)               ▼ (dossier deploiement/)
 ┌──────── VPS 2 : INTÉGRATION CONTINUE ─────────┐   ┌──────────────────────────────┐
 │ Caddy (HTTPS) ─▶ Jenkins ─analyse─▶ SonarQube │   │ GitLab.com                   │
 │                    ▲  ◀─Quality Gate─┘   │    │   │ tanguy-cicd/                 │
 │                    │                PostgreSQL│   │ souverainrecrut-deploiement  │
 │                    └─▶ build + scan Trivy     │   │ validate → deploy → verify   │
 │                    └─▶ jeton de déclenchement ─┼──▶│ (lancée par Jenkins)         │
 └───────────────────────────┬───────────────────┘   └──────────────┬───────────────┘
                             │ docker push                          │ SSH (clé dédiée,
                             ▼ (si tout est vert)                   │ sans sudo)
              ┌─────────────────────────────────┐   docker pull     │
              │ Docker Hub                       │◀────────────────┐│
              │ iamkrugs/souverainrecrut-backend │                 ││
              │ :<version>-<sha7>                │                 ▼▼
              └─────────────────────────────────┘   ┌──────────────────────────────────┐
                                                    │ VPS 1 : PRODUCTION               │
          Aucun lien direct VPS 2 ──✕──▶ VPS 1      │ Caddy (HTTPS) ─▶ API ─▶ PostgreSQL│
                                                    │ (réseau interne, volume db_data) │
                                                    └──────────────────────────────────┘

 Le VPS 2 n'a ni clé ni accès au VPS 1 : il publie l'image et demande le déploiement à GitLab.
 DNS (Terraform, provider Hostinger) : api → VPS 1 · jenkins, sonar → VPS 2
```

## 3. Composants et rôles

| Composant | Où | Rôle |
|---|---|---|
| **GitHub** | github.com | Source de vérité du code et des livrables. Chaque push sur `Dev` prévient Jenkins par webhook. |
| **Jenkins** | VPS 2, conteneur | Orchestration de la CI à partir du `Jenkinsfile` versionné |
| **SonarQube** + PostgreSQL | VPS 2, conteneurs | Analyse statique et Quality Gate (*Sonar way*) |
| **Caddy** (CI) | VPS 2, conteneur | HTTPS (Let's Encrypt) pour Jenkins et SonarQube ; seul service exposé du VPS 2 |
| **Trivy** | VPS 2, conteneur lancé par Jenkins | Scan des vulnérabilités de l'image avant publication |
| **Docker Hub** | hub.docker.com | Registre de l'image versionnée, publiée par le VPS 2 et récupérée par le VPS 1 |
| **Terraform** | Poste d'administration → API Hostinger | Enregistrements DNS `api`, `jenkins`, `sonar` (A + AAAA) |
| **Ansible** | Poste d'administration → VPS 1 et VPS 2 (SSH root par clé) | Préparation idempotente des deux serveurs (`playbook.yml` pour la production, `playbook-ci.yml` pour la CI) |
| **GitLab CI/CD** | GitLab.com (runners hébergés) | Déploiement d'un tag d'image sur le VPS 1, **déclenché automatiquement par Jenkins** (ou à la main pour un retour arrière), vérification, retour arrière automatique |
| **API** | VPS 1, conteneur `api` | Service applicatif, sans port publié |
| **PostgreSQL 17** | VPS 1, conteneur `db` | Base de l'application, volume persistant `db_data`, réseau interne uniquement |

## 4. Flux : de la modification du code à l'API déployée

| # | Étape | Où | Barrière |
|---|---|---|---|
| 1 | `git push` sur `Dev` | GitHub | — |
| 2 | Webhook → Jenkins (**immédiat**) | GitHub → VPS 2 | — |
| 3 | `npm ci`, `prisma generate`, ESLint, Prettier | VPS 2 | Lint ou formatage en échec |
| 4 | Tests + couverture | VPS 2 | Test rouge ou couverture < 80 % |
| 5 | Analyse et Quality Gate | VPS 2 (SonarQube) | Gate rouge |
| 6 | Build de l'image `1.0.0-<sha7>` | VPS 2 | Build en échec |
| 7 | Scan de l'image | VPS 2 (Trivy) | HIGH/CRITICAL corrigeable non justifiée |
| 8 | Publication | VPS 2 → Docker Hub | (seulement si 3 à 7 sont verts) |
| 9 | **Jenkins déclenche** la pipeline de déploiement avec ce tag | VPS 2 → GitLab | Tag invalide ou absent de Docker Hub |
| 10 | Sauvegarde de la base, pull, migrations, démarrage | GitLab → SSH → VPS 1 | Migration ou healthcheck en échec : **retour automatique au tag précédent** |
| 11 | Vérification publique `/v1/ready` | GitLab → VPS 1 | API non `READY` |

**Traçabilité :** le tag `<version>-<sha7>` et les labels OCI (`revision`, `version`, `source`) relient l'image déployée au commit exact. Sur le VPS 1, `deploy-history.log` et l'environnement GitLab `production` conservent l'historique des versions déployées.

## 5. Réseau et exposition

| Serveur | Exposé | Non exposé |
|---|---|---|
| VPS 2 (CI) | 443 (HTTPS : Jenkins, SonarQube), 80 (redirection et certificats), 22 (SSH par clé). Pare-feu `ufw` : tout le reste est refusé. | Ports de Jenkins et SonarQube (joignables seulement par Caddy, sur le réseau Docker interne), base de SonarQube |
| VPS 1 (production) | 443 via le reverse proxy existant, 22 (SSH) | API (aucun port publié, jointe par Caddy via le réseau `web`), PostgreSQL (réseau interne `backend`, sans accès Internet) |

Sur le VPS 1, qui héberge aussi d'autres services sans lien avec le projet, le déploiement est isolé :
- projet Compose dédié (`/opt/souverainrecrut`) ;
- fichier Caddy dédié ;
- compte dédié ;
- aucun port ouvert ;
- le service Docker n'est jamais redémarré.

## 6. Secrets

| Secret | Emplacement |
|---|---|
| Tokens SonarQube et Docker Hub (CI), jeton de déclenchement GitLab | Credentials Jenkins, sur le VPS 2 (masqués dans les logs) |
| Mot de passe de la base SonarQube | `.env` du lab sur le VPS 2 (droits 600) |
| Token Docker Hub en lecture seule (téléchargements du VPS 2) | `/root/.docker/config.json` sur le VPS 2 (root uniquement) |
| Token API Hostinger | Saisi à la demande dans le shell (`HOSTINGER_API_TOKEN`) |
| Clé SSH de déploiement | Variable GitLab de type *File*, protégée ; clé publique gérée par Ansible (mode exclusif) sur le VPS 1 |
| `POSTGRES_PASSWORD`, `JWT_SECRET` | **Uniquement sur le VPS 1** (`/opt/souverainrecrut/.env`, droits 600), générés sur place |

Aucun secret de production n'est présent sur le serveur de CI. Aucun secret n'est présent dans le dépôt, les images ou les logs (scan gitleaks : `no leaks found`). Inventaire et procédures : [`gestion-des-secrets.md`](gestion-des-secrets.md).

## 7. Choix techniques

| Choix | Justification |
|---|---|
| **CI et production sur deux VPS distincts**, sans lien direct (image par Docker Hub, ordre de déploiement par GitLab) | Moindre privilège, isolation des ressources, indépendance des deux environnements (voir §1) |
| **Déploiement continu** : Jenkins déclenche GitLab après un build vert | Un push suffit pour livrer ; sécurité assurée par les barrières de la CI et le retour automatique en production (démontré) |
| Image construite **une fois** (VPS 2), déployée telle quelle (VPS 1) | Ce qui est testé et scanné est exactement ce qui tourne en production |
| CI (Jenkins) et CD (GitLab) séparées, dépôt de déploiement dédié | Responsabilités distinctes ; le déploiement ne dépend que d'un tag publié (orchestration multi-dépôts vue en cours) |
| Webhook GitHub → Jenkins (HTTPS) | Build déclenché dès le push, sans scrutation périodique |
| Tag `<version>-<sha7>`, jamais `latest` | Traçabilité et rollback déterministe |
| Lab d'abord construit en local, puis **migré tel quel** sur le VPS 2 (volumes Docker) | Configuration validée avant exposition ; job, credentials, projet SonarQube et Quality Gate conservés |
| Terraform limité au DNS | L'hébergeur des VPS n'a pas de provider ; la zone DNS (Hostinger) en a un officiel |
| Ansible idempotent et non destructif, tâches Docker communes aux deux serveurs | Même socle sur les deux VPS ; serveur de production partagé : aucune mise à jour complète ni redémarrage de Docker ; simulation `--check` avant application |
| Limites mémoire des conteneurs de CI | Un dépassement arrête le conteneur fautif sans priver le serveur de mémoire |
| Migrations dans un conteneur ponctuel `migrate` | `prisma migrate deploy` est exécuté avant l'API, qui ne démarre que s'il réussit |
| Sauvegarde `pg_dump` avant chaque déploiement | Permet de revenir en arrière même après une migration |
