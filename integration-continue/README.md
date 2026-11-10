# Intégration continue — Backend SouverainRecrut

Ce dossier regroupe les livrables de la partie **Intégration continue** (cahier des charges §3).
Le code testé se trouve dans `backend/`. Ce dossier contient la documentation, les rapports et, plus tard, la configuration Sonar et le Jenkinsfile.

| Étape | Statut |
|---|---|
| 3.1 Préparation du dépôt (fork, clone, branche `Dev`) | ✅ |
| 3.2 Tests Backend + couverture | ✅ |
| Lint (ESLint) + formatage (Prettier) | ✅ |
| Lab local : SonarQube + Jenkins (Docker Compose, `lab/`) | ✅ |
| Migration du lab sur le serveur de CI dédié (VPS 2) + webhook GitHub | ✅ |
| 3.3 Analyse SonarQube + Quality Gate | ✅ |
| Déploiement (VPS Ubuntu, jour 2) : voir [`deploiement/`](../deploiement/README.md) | ⏳ |
| 3.4 / 3.5 Jenkins + Jenkinsfile | ✅ |
| 3.6 Image Docker, Trivy, Docker Hub | ✅ |

---

## 1. Prérequis

- Node.js ≥ 22, npm
- Aucune base PostgreSQL n'est nécessaire pour les tests : Prisma est simulé (voir §2.2).

```bash
cd backend
npm ci
npx prisma generate
```

## 2. Tests automatisés (§3.2)

### 2.1 Outils retenus

| Outil | Rôle |
|---|---|
| **Jest** | Framework de test, assertions, mocks, couverture |
| **ts-jest** | Exécute directement les tests TypeScript (avec vérification de types) |
| **supertest** | Envoie de vraies requêtes HTTP à l'application Express, sans ouvrir de port |

### 2.2 Stratégie

La stratégie suit la pyramide des tests :

- **Tests unitaires** (`backend/tests/unit/`) : utilitaires, middlewares (authentification JWT, autorisation par rôle, validation Zod, gestion d'erreurs) et services métier.
- **Tests d'intégration HTTP** (`backend/tests/integration/`) : l'application Express complète (routes → middlewares → contrôleurs → services → repositories) est appelée avec supertest.
- **Base de données simulée** : le module `src/config/prisma` est remplacé par un faux client (`tests/helpers/prisma-mock.ts`). Chaque test définit ce que « retourne la base ». Les tests sont donc rapides, déterministes et exécutables dans la pipeline sans PostgreSQL.
- **Secrets de test** : `tests/setup-env.ts` définit un `JWT_SECRET` factice, utilisé uniquement par les tests.

### 2.3 Fonctionnalités couvertes

| Domaine | Ce qui est vérifié |
|---|---|
| Authentification | login OK / email inconnu / mauvais mot de passe, token JWT valide, mot de passe jamais renvoyé, `/auth/me` |
| Contrôle des accès | 401 sans token, token falsifié ou expiré, 403 quand le rôle est insuffisant (`/users` réservé ADMIN, `DELETE` réservé ADMIN) |
| Utilisateurs | CRUD, email en doublon (409), hachage bcrypt du mot de passe |
| Candidats | CRUD, validation (400), email normalisé en minuscules, doublon (409), 404 |
| Offres | CRUD, validation, 404 |
| Candidatures | CRUD, statut invalide rejeté, changement de statut |
| Supervision | `/health`, `/ready` (200 si la base répond, 503 sinon), `/info`, dashboard |
| Robustesse | route inconnue (404), erreur inattendue → 500 sans fuite du message interne |

### 2.4 Commandes

```bash
npm test                # lance les tests
npm run test:coverage   # tests + rapport de couverture
```

Le rapport est généré dans `backend/coverage/`, qui est ignoré par Git :

- `coverage/lcov.info` : format lu par **SonarQube** (`sonar.javascript.lcov.reportPaths`)
- `coverage/lcov-report/index.html` : rapport HTML lisible dans un navigateur

Un **seuil minimal de 80 %** est configuré dans `jest.config.js` (`coverageThreshold`), aligné sur le Quality Gate vu en cours. En dessous de ce seuil, `npm run test:coverage` échoue, et la pipeline aussi.

### 2.5 Résultat

**19 suites, 110 tests, couverture de 100 %** (instructions, branches, fonctions, lignes).
Le détail est dans [`reports/couverture-tests-2026-11-09.txt`](reports/couverture-tests-2026-11-09.txt).

Fichiers exclus de la couverture, car ce n'est pas de la logique applicative :

- `src/server.ts` : il ne fait que démarrer le serveur HTTP ;
- `src/docs/**` : la description Swagger ;
- `src/types/**` : uniquement des déclarations de types.

## 3. Qualité du code : lint et formatage

| Commande | Rôle |
|---|---|
| `npm run lint` | ESLint (règles recommandées JS + TypeScript) |
| `npm run lint:fix` | Corrige automatiquement ce qui peut l'être |
| `npm run format` | Formate tout le code avec Prettier |
| `npm run format:check` | Vérifie le formatage sans modifier (à utiliser en pipeline) |

Configuration : `backend/eslint.config.mjs`, `backend/.prettierrc.json` et `backend/.prettierignore`. `eslint-config-prettier` évite que les deux outils se contredisent.

Correction faite à cette occasion : `src/middlewares/auth.middleware.ts` utilisait `as any` pour le rôle extrait du JWT. Il est désormais typé avec l'enum Prisma `Role`.

## 4. Lab local (Jenkins + SonarQube)

Le lab tourne en local avec Docker Compose (`lab/docker-compose.yml`). Le VPS Ubuntu de production est réservé au déploiement (jour 2).

| Service | Image | Accès |
|---|---|---|
| `sonarqube` | `sonarqube:community` (26.11) | http://localhost:9000 |
| `sonar-db` | `postgres:17-alpine` | interne uniquement |
| `jenkins` | image construite depuis `lab/jenkins/Dockerfile` (Jenkins LTS JDK 21 + Docker CLI + Node.js 22 + plugins) | http://localhost:8080 |

```bash
cd integration-continue/lab
cp .env.example .env    # puis renseigner SONAR_DB_PASSWORD (openssl rand -hex 16) et DOCKER_GID
docker compose up -d --build
```

Choix techniques et compromis :

- **Ports liés à `127.0.0.1`** : les services ne sont pas exposés sur le réseau local. Contrepartie : GitHub ne peut pas joindre Jenkins par webhook, donc le déclenchement se fait par *Poll SCM*.
- **Socket Docker de l'hôte monté dans Jenkins** : Jenkins peut construire et scanner des images sans Docker-in-Docker. Contrepartie : Jenkins a des droits équivalents à root sur l'hôte. Ce choix est acceptable pour un lab local ; en production, on utiliserait un agent de build dédié ou un builder sans daemon (Kaniko, BuildKit rootless).
- Le mot de passe de la base SonarQube est fourni par un `.env` non versionné (voir `documentation/gestion-des-secrets.md`).

## 5. Analyse SonarQube (§3.3)

Configuration versionnée : `backend/sonar-project.properties` (sources, tests, exclusions, chemin du rapport `lcov`). Aucun secret : l'URL du serveur et le token sont fournis à l'exécution.

Analyse manuelle, depuis `backend/` :

```bash
npm run test:coverage
read -rsp "Token Sonar : " SONAR_TOKEN && export SONAR_TOKEN
docker run --rm --network souverainrecrut-ci_default \
  -e SONAR_HOST_URL=http://sonarqube:9000 -e SONAR_TOKEN \
  -v "$PWD:/usr/src" sonarsource/sonar-scanner-cli
```

### Résultats et corrections

| Indicateur | 1re analyse | Après corrections |
|---|---|---|
| Quality Gate (*Sonar way*) | ✅ Passed | ✅ Passed |
| Bugs | 0 | 0 |
| Vulnérabilités | 1 | **0** |
| Code smells | 2 | **0** |
| Security hotspots | 0 | 0 |
| Duplications | 0,0 % | 0,0 % |
| Couverture | 99,8 % | 99,8 % |

| Règle | Constat | Correction |
|---|---|---|
| `typescript:S5689` (sécurité) | Express envoie `X-Powered-By: Express`, ce qui révèle la technologie utilisée à un attaquant | `app.disable("x-powered-by")` dans `src/app.ts`, avec un test d'intégration qui vérifie l'absence de l'en-tête |
| `typescript:S7773` ×2 (maintenabilité) | Usage de la fonction globale `parseInt` | Remplacée par `Number.parseInt` dans `src/utils/pagination.ts` |

Exports bruts de l'API SonarQube : dossier [`sonar/`](sonar/) (`*-initial.json` / `*-apres.json`).

## 6. Pipeline Jenkins et image Docker (§3.4 à §3.6)

- **Jenkinsfile :** [`Jenkinsfile`](Jenkinsfile). Job Jenkins de type *Pipeline script from SCM*, branche `*/Dev`, Script Path `integration-continue/Jenkinsfile`.
- **Prérequis Jenkins :** credentials `sonar-token` et `dockerhub`, serveur SonarQube `sonarqube`, scanner `sonar-scanner`, webhook SonarQube vers `http://jenkins:8080/sonarqube-webhook/`.
- **Image :** `backend/Dockerfile` (Node 22 Alpine, multi-stage, non-root, healthcheck, sans npm), `backend/.dockerignore`.
- **Trivy :** blocage sur HIGH/CRITICAL corrigeable ; exceptions justifiées et datées dans `backend/.trivyignore.yaml`. Rapport : [`reports/trivy-1.0.0-7fa9454.txt`](reports/trivy-1.0.0-7fa9454.txt).
- **Tags publiés :** `iamkrugs/souverainrecrut-backend:<version>-<sha7>` et `:sha-<sha7>`.

Le rapport rédigé, avec les captures, se trouve dans [`documentation/rapport-final.md`](../documentation/rapport-final.md).

## 7. Fichiers ajoutés ou modifiés

```
integration-continue/
├── Jenkinsfile
├── README.md
├── lab/                    # docker-compose Jenkins + SonarQube, image Jenkins
├── reports/                # couverture des tests, rapport Trivy
└── sonar/                  # exports API SonarQube (avant / après)
backend/
├── Dockerfile              # Node 22, multi-stage, non-root
├── .dockerignore
├── .trivyignore.yaml       # exceptions Trivy justifiées et datées
├── sonar-project.properties
├── jest.config.js          # config Jest + seuil de couverture
├── tsconfig.test.json      # config TS dédiée aux tests (n'impacte pas le build)
├── eslint.config.mjs, .prettierrc.json, .prettierignore
└── tests/                  # unit/, integration/, helpers/
documentation/
├── rapport-final.md
├── gestion-des-secrets.md
└── captures/
```

## 8. Serveur d'intégration continue (VPS 2)

Après validation en local, le lab a été migré **tel quel** sur un VPS dédié à la CI, séparé du serveur de production. Les deux serveurs n'ont aucun lien direct : Docker Hub est leur seule interface (voir [`documentation/architecture.md`](../documentation/architecture.md) §1).

| Élément | Détail |
|---|---|
| Accès | https://jenkins.tanguydavid.fr · https://sonar.tanguydavid.fr (HTTPS Caddy, Let's Encrypt) |
| Fichiers | `lab/docker-compose.yml` + surcouche `lab/docker-compose.vps.yml` : Caddy, aucun port Jenkins/SonarQube publié, limites mémoire |
| Préparation | `deploiement/ansible/playbook-ci.yml` : Docker, pare-feu (22/80/443), `vm.max_map_count`, fichiers du lab, `.env` (sans affichage) |
| DNS | `deploiement/terraform/` : `jenkins` et `sonar` (A + AAAA) |
| Migration | Copie des volumes `jenkins_home`, `sonar_db`, `sonar_data` et `sonar_extensions` par SSH. Configuration, credentials, projet SonarQube et Quality Gate conservés. |
| Déclenchement | Plugin `github` + `githubPush()` ; webhook GitHub → `https://jenkins.tanguydavid.fr/github-webhook/` |
| Docker Hub | Connexion avant le build (et token en lecture seule pour root) : le quota anonyme, partagé par l'IPv6 de l'hébergeur, renvoyait `429 Too Many Requests` |

```bash
cd deploiement/ansible
ansible-playbook playbook-ci.yml --check --diff   # simulation
ansible-playbook playbook-ci.yml --diff           # préparation du serveur
ansible-playbook playbook-ci.yml --tags start     # construction et démarrage du lab
```
