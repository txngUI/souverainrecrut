# Gestion des secrets — SouverainRecrut CI/CD

> **Aucune valeur secrète ne figure dans ce document ni dans le dépôt** (cahier des charges §4.4 et §6).
> Ce document recense chaque secret : son rôle, où il est stocké, qui l'utilise, et comment le créer, le renouveler ou le révoquer.

## 1. Principes appliqués

| Règle | Mise en œuvre |
|---|---|
| Jamais de secret dans Git | `.env` ignoré par `.gitignore` ; seuls des `.env.example` aux valeurs factices sont versionnés |
| Jamais de secret dans le Jenkinsfile ni dans `.gitlab-ci.yml` | Les fichiers de pipeline ne référencent que des **identifiants** (`credentialsId`, noms de variables) |
| Jamais de secret dans l'image Docker | Pas de secret en `ARG`/`ENV` dans le Dockerfile ; `.dockerignore` exclut `.env` |
| Jamais de secret dans les logs | Credentials Jenkins masqués ; `docker login --password-stdin` (pas de `-p`) ; variables GitLab *masked* |
| Portée minimale | Tokens limités au strict nécessaire (ex. Docker Hub : *Read & Write* sur le seul dépôt utile) |
| Durée de vie limitée | Date d'expiration posée lorsque l'outil le permet ; rotation décrite §4 |
| Détection | Scan `gitleaks` du dépôt avant livraison (§5) |

## 2. Inventaire

Statut : ⏳ = à créer · ✅ = créé et stocké

### 2.1 Intégration continue (Jenkins + SonarQube, serveur de CI — VPS 2)

| Secret | Utilisé par | Stocké dans | Identifiant de référence | Type | Statut |
|---|---|---|---|---|---|
| Token d'accès Docker Hub | Jenkins, étape *Publish* (`docker push`) | Credentials Jenkins | `dockerhub` | Username with password (utilisateur + token, *Read & Write*, expiration 30 j) | ✅ |
| Token d'analyse SonarQube | Jenkins, étape *SonarQube* | Credentials Jenkins + config du serveur SonarQube dans Jenkins | `sonar-token` | Secret text (Global Analysis Token, expiration 30 j) | ✅ |
| Mot de passe admin SonarQube | Administration de SonarQube | Gestionnaire de mots de passe personnel | — | — | ✅ (mot de passe par défaut `admin` changé au 1er login) |
| Mot de passe admin Jenkins | Administration de Jenkins (exposé en HTTPS) | Gestionnaire de mots de passe personnel | — | — | ✅ mot de passe fort défini et fichier `initialAdminPassword` supprimé **avant** l'exposition sur Internet |
| Token d'analyse locale SonarQube (`analyse-locale`) | Analyses manuelles depuis le poste | Saisi à la demande (`read -rs`), jamais écrit sur disque | `SONAR_TOKEN` (shell) | Project Analysis Token, expiration 30 j | ✅ |
| Mot de passe de la base PostgreSQL de SonarQube | Conteneurs `sonarqube` / `sonar-db` | `.env` du lab, non versionné (généré par `openssl rand -hex 16`) : poste d'administration, puis `/opt/souverainrecrut-ci/.env` sur le VPS 2 (droits 600, copié par Ansible sans affichage) | `SONAR_DB_PASSWORD` | Variable d'environnement | ✅ |
| Token Docker Hub **en lecture seule** du VPS 2 | Téléchargement des images (le quota anonyme de l'IPv6 partagée était épuisé) | `/root/.docker/config.json` sur le VPS 2, lisible par root uniquement | `vps-ci-pull` | Personal access token, *Read-only*, expiration 30 j | ✅ |
| Jeton de déclenchement GitLab (`jenkins-vps2`) | Jenkins, étape *Deploy (GitLab)* : lance la pipeline de déploiement | Credentials Jenkins (Secret text) ; révocable dans GitLab (*Settings → CI/CD → Pipeline trigger tokens*) | `gitlab-trigger-token` | Pipeline trigger token : **lance uniquement** la pipeline de ce projet, sans accès au code ni au serveur | ✅ |
| Webhook GitHub → Jenkins | Déclenchement des builds | Aucun secret aujourd'hui : le webhook ne fait que demander à Jenkins de relire le dépôt | `/github-webhook/` | — | Amélioration prévue : secret partagé (HMAC) |
| Token GitHub (si dépôt privé) | Jenkins, étape *Checkout* | Credentials Jenkins | `github` | Username with password (PAT *fine-grained*, lecture seule) | Non nécessaire : le fork est public |

### 2.2 Application Backend

| Secret | Utilisé par | Stocké dans | Variable | Statut |
|---|---|---|---|---|
| Clé de signature JWT | API (signature/vérification des tokens) | `/opt/souverainrecrut/.env` sur le serveur (droits 600, non versionné) | `JWT_SECRET` | ⏳ |
| Chaîne de connexion PostgreSQL (contient le mot de passe) | API + Prisma (migrations) | Construite par `docker-compose.yml` à partir de `POSTGRES_PASSWORD` | `DATABASE_URL` | ⏳ |
| Mot de passe PostgreSQL applicatif | Conteneurs `db`, `migrate`, `api` | `/opt/souverainrecrut/.env` sur le serveur (droits 600, non versionné) | `POSTGRES_PASSWORD` | ⏳ |
| Clé SSH de déploiement | GitLab CI → compte `souverainrecrut` | Privée : poste de l'administrateur puis variable GitLab ; publique : `authorized_keys` (posée par Ansible, mode exclusif) | `~/.ssh/souverainrecrut_deploy` | ✅ (rotation effectuée le 09/11, voir §4.1) |

> Pour les tests automatisés, un `JWT_SECRET` **factice** (`test-secret`) est défini dans `backend/tests/setup-env.ts`. Il ne sert qu'aux tests et n'est utilisé dans aucun environnement réel.

### 2.3 Provisionnement (Terraform, jour 2)

| Secret | Utilisé par | Stocké dans | Variable | Statut |
|---|---|---|---|---|
| Token API Hostinger (gestion DNS de `tanguydavid.fr`) | `terraform plan` / `apply` (enregistrements `api`) | Saisi à la demande dans le shell, jamais écrit sur disque | `HOSTINGER_API_TOKEN` | ✅ (expiration courte, à révoquer en fin de projet) |
| État Terraform (`terraform.tfstate`) | Terraform | Local, ignoré par Git (`deploiement/terraform/.gitignore`) | — | — |

### 2.4 Déploiement (GitLab CI, jour 2)

| Secret | Utilisé par | Stocké dans | Variable GitLab | Options | Statut |
|---|---|---|---|---|---|
| Clé privée SSH de déploiement | Pipeline GitLab → compte `souverainrecrut` | Variables CI/CD GitLab | `SSH_PRIVATE_KEY` | Type *File*, Protected | ✅ |
| Empreinte SSH du serveur | Vérification stricte de l'hôte (anti-usurpation) | Variables CI/CD GitLab | `SSH_KNOWN_HOSTS` | Protected (non secret) | ✅ |
| Adresse du serveur | Pipeline GitLab | Variables CI/CD GitLab | `DEPLOY_HOST` | Protected (non secret) | ✅ |
| Utilisateur SSH | Pipeline GitLab | Variables CI/CD GitLab | `DEPLOY_USER` | Protected (non secret) | ✅ |
| Utilisateur Docker Hub | Pipeline GitLab (`docker login` sur le serveur) | Variables CI/CD GitLab | `DOCKERHUB_USER` | Non créée : l'image est publique | — |
| Token Docker Hub (lecture seule) | Pipeline GitLab (`docker pull`) | Variables CI/CD GitLab | `DOCKERHUB_TOKEN` | Non créée : l'image est publique | — |

> **Secrets applicatifs** (`JWT_SECRET`, `POSTGRES_PASSWORD`) : ils ne sont **pas** copiés dans GitLab. Ils sont générés une seule fois sur le serveur (`openssl rand`), restent dans `/opt/souverainrecrut/.env` (droits 600), et la pipeline ne modifie que `BACKEND_TAG`. Un secret qui n'est pas dupliqué ne peut pas fuiter par la CI. Cela évite aussi un écart de mot de passe avec la base déjà initialisée.

## 3. Création des secrets

| Secret | Procédure |
|---|---|
| Token Docker Hub | Docker Hub → *Account settings* → *Personal access tokens* → *Generate*. Permissions : *Read & Write* pour Jenkins, *Read-only* pour GitLab. Poser une expiration. |
| Token SonarQube | SonarQube → *My Account* → *Security* → *Generate Token*. Type *Global Analysis Token* (ou *Project Analysis Token*), avec une expiration. |
| Clé JWT / mots de passe | `openssl rand -hex 32` |
| Clé SSH de déploiement | `ssh-keygen -t ed25519 -C "deploy-souverainrecrut" -f deploy_key`, puis la clé publique dans `~/.ssh/authorized_keys` du serveur et la clé privée dans GitLab. La clé est dédiée au déploiement, jamais la clé personnelle. |
| Credential Jenkins | *Administrer Jenkins* → *Credentials* → *System* → *Global* → *Add credentials*, avec l'identifiant indiqué dans l'inventaire. |

## 4. Rotation et révocation

| Événement | Action |
|---|---|
| Secret exposé (commit, log, capture d'écran…) | 1) **Révoquer immédiatement** dans l'outil d'origine. 2) Générer un nouveau secret. 3) Mettre à jour Jenkins ou GitLab. 4) Relancer la pipeline. Supprimer le commit ne suffit pas : l'historique Git conserve la valeur. |
| Fin du projet / après correction | Révoquer les tokens Docker Hub, SonarQube et GitHub, le jeton de déclenchement GitLab, ainsi que la clé SSH de déploiement. |
| Token temporaire de démonstration | Le token Docker Hub `demo-panne` (écriture, 1 jour), utilisé pour publier l'image de test du retour automatique, a été révoqué et l'image supprimée juste après la démonstration. |
| Expiration d'un token | Générer un nouveau token, mettre à jour le credential (même identifiant), puis relancer un build pour vérifier. |

### 4.1 Incident traité : rotation de la clé de déploiement (09/11/2026)

| Étape | Action |
|---|---|
| Constat | Le contenu de la variable GitLab `SSH_PRIVATE_KEY` a été affiché puis capturé à l'écran pendant le diagnostic d'une erreur de format : la clé est considérée comme **exposée** |
| Révocation | Le playbook Ansible gère `authorized_keys` du compte `souverainrecrut` en mode **exclusif** : seule la clé courante est conservée |
| Rotation | Nouvelle clé générée (`ssh-keygen -t ed25519`), playbook rejoué (ancienne clé retirée, nouvelle ajoutée), variable GitLab remplacée |
| Vérification | Une seule clé autorisée sur le serveur, d'empreinte identique à la nouvelle clé locale (`SHA256:dvwQGb…azXPI`) ; déploiement par la pipeline réussi avec la nouvelle clé ; autres comptes du serveur non affectés |
| Mesure préventive | Ne jamais révéler une variable sensible pour une capture : les captures montrent la **liste** des variables, sans les valeurs |

## 5. Vérification avant livraison

```bash
# Aucun secret dans le dépôt ni dans l'historique
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo -v

# Aucun fichier .env réel suivi par Git (seuls les .env.example doivent sortir)
git ls-files | grep -E '(^|/)\.env' 
```

**Résultat au 09/11/2026 :** `no leaks found` sur les 8 commits. Les 4 alertes du premier scan étaient des faux positifs, vérifiés un par un et déclarés dans `.gitleaksignore` à la racine du dépôt :

- identifiants et hash d'issues dans `integration-continue/sonar/issues-initial.json` ;
- exemple Swagger d'en-tête JWT tronqué, sans signature, dans `backend/src/docs/auth.docs.ts`.

Seuls des `.env.example` sont suivis par Git.

Preuves jointes au livrable dans `documentation/captures/` :

- écran *Credentials* de Jenkins (valeurs masquées) ;
- variables CI/CD GitLab (valeurs masquées) ;
- log de pipeline montrant `****` à la place des secrets ;
- résultat du scan gitleaks.

## 6. Accès de l'évaluateur

Les secrets ne sont pas transmis dans le livrable. L'évaluation se fait :

- **par démonstration** lors de la soutenance, sur l'environnement de l'étudiant ;
- **par reproduction** : l'évaluateur crée ses propres tokens en suivant le §3 et les enregistre sous les mêmes identifiants. Les pipelines fonctionnent alors sans modification.

Si une transmission de valeurs est explicitement demandée, elle se fait **hors dépôt et hors archive**, avec des tokens dédiés à l'évaluation, de portée minimale, avec expiration, et révoqués après la correction.
