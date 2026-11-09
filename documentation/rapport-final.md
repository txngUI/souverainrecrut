# Rapport — Industrialisation CI/CD du Backend SouverainRecrut

**Module** CI/CD · M2 Expert en Développement et Déploiement de Solutions Numériques Sécurisées · Sup de Vinci Rennes
**Auteur** Tanguy D. · **Formateur** Alimou Diallo · **Date** 09/11/2026
**Dépôt** https://github.com/txngUI/souverainrecrut (branche `Dev`) · **Image** `iamkrugs/souverainrecrut-backend`

---

## Sommaire

1. [Contexte et objectif](#1-contexte-et-objectif)
2. [Architecture mise en œuvre](#2-architecture-mise-en-œuvre)
3. [Tests automatisés et couverture](#3-tests-automatisés-et-couverture)
4. [Analyse SonarQube et Quality Gate](#4-analyse-sonarqube-et-quality-gate)
5. [Lab Jenkins](#5-lab-jenkins)
6. [Pipeline CI (Jenkinsfile)](#6-pipeline-ci-jenkinsfile)
7. [Image Docker et scan Trivy](#7-image-docker-et-scan-trivy)
8. [Publication Docker Hub](#8-publication-docker-hub)
9. [Gestion des secrets](#9-gestion-des-secrets)
10. [Bilan et pistes d'amélioration](#10-bilan-et-pistes-damélioration)
11. [Déploiement (jour 2)](#11-déploiement-jour-2)

---

## 1. Contexte et objectif

SouverainRecrut est une API REST de gestion du recrutement, développée avec Node.js 22, Express, TypeScript et Prisma (PostgreSQL). Le périmètre est **le backend uniquement**.

**Objectif :** toute modification poussée sur `Dev` est automatiquement testée, analysée, conteneurisée, scannée, puis publiée sur Docker Hub sous un tag traçable. La publication n'a lieu que si tous les contrôles sont verts.

## 2. Architecture mise en œuvre

```
Développeur ──git push──▶ GitHub (branche Dev)
                              │  Poll SCM (5 min)
                              ▼
┌──────────────── Lab local (Docker Compose) ─────────────────┐
│  Jenkins ──analyse──▶ SonarQube ──▶ PostgreSQL (sonar-db)    │
│     ▲                    │                                   │
│     └──── webhook ───────┘  (résultat du Quality Gate)       │
│     │                                                        │
│     └──▶ Docker (hôte) : build image + scan Trivy            │
└──────────────────────────────────────────────────────────────┘
                              │  docker push (si tout est vert)
                              ▼
                 Docker Hub : iamkrugs/souverainrecrut-backend
                              │  docker pull (jour 2)
                              ▼
          VM Ubuntu (VMware) : Docker Compose + PostgreSQL
```

| Outil | Rôle |
|---|---|
| **Git / GitHub** | Source de vérité du code ; la branche `Dev` déclenche la pipeline |
| **Jest, ts-jest, supertest** | Tests unitaires et d'intégration HTTP, rapport de couverture |
| **ESLint, Prettier** | Règles de code et formatage, vérifiés dans la pipeline |
| **SonarQube** | Analyse statique (bugs, vulnérabilités, code smells, duplications, couverture) et Quality Gate |
| **Jenkins** | Orchestration de la pipeline, décrite dans un Jenkinsfile versionné |
| **Docker** | Construction d'une image immuable et reproductible |
| **Trivy** | Scan des vulnérabilités de l'image avant publication |
| **Docker Hub** | Registre de l'image versionnée, récupérée par le déploiement |

![Lab Docker : services démarrés](captures/lab-01-docker-compose-ps.png)

## 3. Tests automatisés et couverture

**Choix :** Jest + ts-jest (tests TypeScript typés) et supertest (requêtes HTTP réelles sur l'application Express, sans ouvrir de port). Le client Prisma est **simulé** : les tests sont rapides, déterministes et n'ont pas besoin de PostgreSQL dans la pipeline.

| Niveau | Périmètre |
|---|---|
| Unitaires (`tests/unit`) | Pagination, middlewares (JWT, rôles, validation Zod, erreurs), 8 services, configuration |
| Intégration (`tests/integration`) | Toutes les routes : authentification, utilisateurs, candidats, offres, candidatures, dashboard, santé |

Points couverts : login valide ou invalide, token absent, falsifié ou expiré (401), rôle insuffisant (403), validation (400), doublons (409), ressources absentes (404), erreur interne masquée (500), absence de l'en-tête `X-Powered-By`.

**Résultat : 19 suites, 110 tests, 100 % de couverture** (instructions, branches, fonctions, lignes). Un seuil de **80 %** est imposé dans `jest.config.js` : en dessous, la pipeline échoue.

Rapport complet : [`integration-continue/reports/couverture-tests-2026-11-09.txt`](../integration-continue/reports/couverture-tests-2026-11-09.txt)

![Couverture des tests](captures/tests-01-couverture.png)

## 4. Analyse SonarQube et Quality Gate

Configuration versionnée dans `backend/sonar-project.properties` (sources, tests, exclusions, rapport `lcov`). Quality Gate : **Sonar way** (couverture du nouveau code ≥ 80 %, aucun nouveau bug ni vulnérabilité, duplications ≤ 3 %).

| Indicateur | 1re analyse | Après corrections |
|---|---|---|
| Quality Gate | Passed | **Passed** |
| Bugs | 0 | 0 |
| Vulnérabilités | 1 | **0** |
| Code smells | 2 | **0** |
| Security hotspots | 0 | 0 |
| Duplications | 0,0 % | 0,0 % |
| Couverture | 99,8 % | 99,8 % |

| Règle | Constat | Correction |
|---|---|---|
| S5689 (sécurité) | Express révèle sa présence via l'en-tête `X-Powered-By` | `app.disable("x-powered-by")` + test associé |
| S7773 ×2 | Usage de `parseInt` global | `Number.parseInt` |

Exports bruts de l'API : [`integration-continue/sonar/`](../integration-continue/sonar/)

![SonarQube — avant corrections](captures/sonar-01-overview-avant.png)
![SonarQube — après corrections](captures/sonar-02-overview-apres.png)

## 5. Lab Jenkins

Jenkins et SonarQube tournent en local via `integration-continue/lab/docker-compose.yml`. La VM VMware est réservée au déploiement.

| Élément | Configuration |
|---|---|
| Image Jenkins | LTS JDK 21 + Docker CLI + Node.js 22 + plugins (Git, Pipeline, SonarQube, Credentials Binding) |
| Accès Docker | Socket de l'hôte monté : build et scan sans Docker-in-Docker |
| SonarQube | Serveur `sonarqube` déclaré dans Jenkins, scanner installé automatiquement |
| Webhook | SonarQube → `http://jenkins:8080/sonarqube-webhook/` |
| Déclencheur | Poll SCM toutes les 5 minutes |

**Choix et compromis :**
- **Ports liés à `127.0.0.1` :** rien n'est exposé sur le réseau local. Contrepartie : GitHub ne peut pas joindre Jenkins, d'où le *Poll SCM* au lieu d'un webhook GitHub.
- **Socket Docker monté :** simple et suffisant pour un lab. En production, on utiliserait un agent dédié ou un builder sans daemon.
- **Validation des webhooks locaux désactivée dans SonarQube :** acceptable ici uniquement parce que SonarQube n'est pas exposé.

![Webhook SonarQube vers Jenkins](captures/sonar-03-webhook-jenkins.png)
![Credentials Jenkins (valeurs masquées)](captures/jenkins-01-credentials.png)
![Configuration du job](captures/jenkins-02-job-config.png)

## 6. Pipeline CI (Jenkinsfile)

Fichier versionné : [`integration-continue/Jenkinsfile`](../integration-continue/Jenkinsfile)

| # | Étape | Rôle | Échec si… |
|---|---|---|---|
| 1 | Checkout | Récupère `Dev`, calcule le tag `version-sha` | — |
| 2 | Install | `npm ci` (versions exactes du lockfile) | dépendance introuvable |
| 3 | Prisma generate | Génère le client Prisma | schéma invalide |
| 4 | Lint | ESLint + vérification Prettier | règle violée |
| 5 | Tests | Tests + couverture | test rouge ou couverture < 80 % |
| 6 | SonarQube | Envoie l'analyse | — |
| 7 | Quality Gate | Attend le verdict de SonarQube (webhook) | gate rouge |
| 8 | Docker build | Image taguée et étiquetée (version, commit, source) | build KO |
| 9 | Trivy | Rapport archivé + contrôle bloquant | HIGH/CRITICAL corrigeable non justifiée |
| 10 | Publish | `docker push` (branche `Dev` uniquement) | authentification KO |

Les étapes sont séquentielles : **un échec arrête la pipeline, et l'image n'est pas publiée**.

![Pipeline verte](captures/jenkins-03-pipeline-stage-view.png)
![Artefacts archivés (couverture, rapport Trivy)](captures/jenkins-04-artefacts.png)

## 7. Image Docker et scan Trivy

**Dockerfile** (`backend/Dockerfile`) : build multi-stage `node:22-alpine`. L'image finale ne contient que `dist/`, les dépendances de production et le client Prisma. Autres caractéristiques :
- utilisateur **non-root** (`node`) ;
- **healthcheck** sur `/v1/health` ;
- npm et npx retirés ;
- `.dockerignore` excluant `.env`, les tests et `node_modules`.

**Politique Trivy (seuils acceptés) :**
- **bloquant :** toute vulnérabilité **HIGH ou CRITICAL disposant d'un correctif** ;
- **toléré :** MEDIUM et LOW, reportés dans le rapport ;
- **exceptions :** déclarées dans `backend/.trivyignore.yaml`, chacune **justifiée et datée**. À expiration, elle redevient bloquante.

| Scan de l'image | CRITICAL | HIGH | MEDIUM |
|---|---|---|---|
| Image d'origine (Node 20, root, avec npm) | 1 | 26 | — |
| Après corrections (`npm audit fix`, npm retiré) | **0** | 1 (exception) | 3 |

Exception en vigueur : **CVE-2026-40345** (`deepmerge-ts`, dépendance interne de l'outillage Prisma, non atteignable par les requêtes HTTP). Son correctif impose Prisma 7 ; l'exception expire le 31/12/2026.

Rapport complet : [`integration-continue/reports/trivy-1.0.0-7fa9454.txt`](../integration-continue/reports/trivy-1.0.0-7fa9454.txt)

![Rapport Trivy dans Jenkins](captures/trivy-01-rapport.png)

## 8. Publication Docker Hub

L'image est publiée avec deux tags traçables, sans `latest` :

- `iamkrugs/souverainrecrut-backend:1.0.0-7fa9454` : version applicative + commit ;
- `iamkrugs/souverainrecrut-backend:sha-7fa9454` : commit seul.

Les labels OCI (`org.opencontainers.image.revision`, `version`, `source`) relient l'image au commit Git.

![Image taguée sur Docker Hub](captures/dockerhub-01-image-taguee.png)

## 9. Gestion des secrets

Aucun secret dans le dépôt, le Jenkinsfile, l'image ou les logs. Les tokens SonarQube et Docker Hub sont stockés dans les **credentials Jenkins**, et le mot de passe de la base SonarQube dans un `.env` non versionné. La connexion à Docker Hub utilise `--password-stdin`, et les logs affichent `****`.

Le token est masqué (`echo ****`) dans les logs. L'avertissement Docker sur le stockage local des identifiants (`~/.docker/config.json`) est traité par un `docker logout` systématique en fin de pipeline (bloc `post { always }`).

Inventaire complet, procédures de création, de rotation et de révocation : [`gestion-des-secrets.md`](gestion-des-secrets.md)

![Secret masqué dans le log de la pipeline](captures/jenkins-05-secret-masque.png)

## 10. Bilan et pistes d'amélioration

**Bilan :** la chaîne CI est complète et automatisée, de `git push` à l'image publiée. Elle comporte trois barrières bloquantes : tests et couverture, Quality Gate, Trivy.

**Démonstration d'un blocage :** le build n°2 a été rejoué (*Replay*) avec un seuil Trivy durci (`--severity MEDIUM,HIGH,CRITICAL`). Trivy détecte les 3 vulnérabilités MEDIUM et renvoie un code de sortie non nul. L'étape *Trivy* échoue, *Publish* n'est pas exécutée et aucune image n'est poussée. Le Quality Gate, lui, reste *Passed* : chaque barrière est indépendante.

![Pipeline bloquée](captures/jenkins-06-pipeline-bloquee.png)

**Pistes d'amélioration :**

- Migrer vers Prisma 7, ce qui lève l'exception Trivy.
- Exposer Jenkins de façon sécurisée pour remplacer le Poll SCM par un webhook GitHub.
- Ajouter un scan de secrets (gitleaks) et un audit de dépendances (`npm audit`) dans la pipeline.
- Construire l'image sur un agent dédié plutôt que via le socket Docker de l'hôte.

## 11. Déploiement (jour 2)

*À compléter : VM Ubuntu (VMware), Terraform, Ansible, GitLab CI/CD, Docker Compose + PostgreSQL, procédure de rollback.*
