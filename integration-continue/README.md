# Intégration continue — Backend SouverainRecrut

Ce dossier regroupe les livrables de la partie **Intégration continue** (cahier des charges §3).
Le code testé se trouve dans `backend/`. Ce dossier contient la documentation, les rapports et, plus tard, la configuration Sonar et le Jenkinsfile.

| Étape | Statut |
|---|---|
| 3.1 Préparation du dépôt (fork, clone, branche `Dev`) | ✅ |
| 3.2 Tests Backend + couverture | ✅ |
| Lint (ESLint) + formatage (Prettier) | ✅ |
| Infra : VM Ubuntu Server (VMware) | ⏳ |
| Lab : SonarQube + Jenkins (Docker) | ⏳ |
| 3.3 Analyse SonarQube + Quality Gate | ⏳ |
| 3.4 / 3.5 Jenkins + Jenkinsfile | ⏳ |
| 3.6 Image Docker, Trivy, Docker Hub | ⏳ |

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

**19 suites, 109 tests, couverture de 100 %** (instructions, branches, fonctions, lignes).
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

## 4. Fichiers ajoutés ou modifiés

```
backend/
├── jest.config.js          # config Jest + seuil de couverture
├── tsconfig.test.json      # config TS dédiée aux tests (n'impacte pas le build)
├── eslint.config.mjs
├── .prettierrc.json
├── .prettierignore
├── package.json            # scripts test, test:coverage, lint, format…
└── tests/
    ├── setup-env.ts
    ├── helpers/            # faux Prisma, génération de token JWT
    ├── unit/               # utils, middlewares, services, config
    └── integration/        # routes HTTP via supertest
```
