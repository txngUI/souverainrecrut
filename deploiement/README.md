# Déploiement — Backend SouverainRecrut

Ce dossier regroupe les livrables de la partie **Provisionnement et déploiement** (cahier des charges §4 et §5).
L'image déployée est celle publiée par Jenkins sur Docker Hub (`iamkrugs/souverainrecrut-backend:<version>-<sha7>`). Elle n'est jamais reconstruite ici.

| Étape | Statut |
|---|---|
| Serveur cible : VPS Ubuntu 24.04 + sauvegarde de configuration avant modification | ✅ |
| 4.2 Terraform : DNS `api.tanguydavid.fr` | ✅ |
| Clé SSH de déploiement + utilisateur dédié `souverainrecrut` | ✅ |
| 4.3 Ansible : préparation du serveur | ✅ |
| 5.2 Docker Compose : API + PostgreSQL + exposition HTTPS via Caddy | ✅ déployé sur https://api.tanguydavid.fr |
| 4.4 / 5.3 Pipeline GitLab CI/CD | ✅ premier déploiement réussi (pipeline 3045841142) |
| Procédures de déploiement et de rollback | ✅ [`procedure-deploiement.md`](../documentation/procedure-deploiement.md) · [`procedure-rollback.md`](../documentation/procedure-rollback.md) |

---

## 1. Serveur cible

**Choix :** un VPS (PulseHeberg, Ubuntu 24.04, 4 vCPU, 8 Go, IPv4 + IPv6 publiques) à la place d'une VM VMware locale.

| Critère | VM VMware (NAT) | VPS retenu |
|---|---|---|
| Joignable par les runners GitLab.com | Non (NAT local) | Oui (IP publique) |
| Représentativité d'une production | Faible | Réelle : exposition Internet, DNS, TLS |
| Point de restauration (§4.1) | Snapshot VMware | Instantanés non inclus dans l'offre : sauvegarde ciblée + modifications uniquement additives + Ansible en mode `--check` (voir §1.1) |

**Contrainte :** le serveur héberge déjà d'autres services, sans lien avec ce projet (dont un reverse proxy Caddy). Le déploiement est conçu pour **ne rien modifier de l'existant** :

| Existant | Mesure |
|---|---|
| Reverse proxy Caddy (ports 80/443) | Ajout d'un fichier dédié `/root/caddy/sites/souverainrecrut.caddy` (le `Caddyfile` importe `sites/*.caddy`) ; rechargement à chaud, sans coupure |
| Autres services du serveur | Projet Compose isolé dans `/opt/souverainrecrut` ; le service Docker n'est jamais redémarré |
| Ports publics | L'API et PostgreSQL n'exposent **aucun** port : l'API est jointe par Caddy via le réseau Docker `web` |
| Accès SSH | Ajout d'un utilisateur dédié `souverainrecrut` ; comptes existants non modifiés ; configuration `sshd` et compte root inchangés |
| DNS de la zone | Terraform n'ajoute que ses propres enregistrements (`overwrite = false`) |

### 1.1 Point de restauration sans snapshot

L'offre du VPS n'inclut pas d'instantanés. La sécurité repose donc sur trois mesures :

1. **Sauvegarde ciblée avant toute modification**, conservée sur le serveur (accès root uniquement) : configuration Caddy, clés SSH, configuration `sshd`, comptes système.
2. **Modifications uniquement additives**, chacune réversible par une commande : ajout de l'utilisateur `deploy`, d'une clé dans `authorized_keys`, du dossier `/opt/souverainrecrut` et d'un fichier Caddy. Rien d'existant n'est modifié ou supprimé.
3. **Simulation préalable :** le playbook Ansible est d'abord exécuté en mode `--check --diff`, qui affiche les changements sans les appliquer.

```bash
# Sauvegarde (sur le VPS, en root)
tar czf /root/backup-avant-souverainrecrut-$(date +%F).tar.gz \
  /root/caddy /root/.ssh /etc/ssh /etc/passwd /etc/group /etc/shadow /etc/sudoers.d
chmod 600 /root/backup-avant-souverainrecrut-*.tar.gz
```

## 2. Terraform — DNS de l'API (§4.2)

**Pourquoi le DNS :** PulseHeberg ne propose pas de provider Terraform, donc le VPS est créé manuellement (cas prévu au §4.2 : « Terraform peut être utilisé sur les ressources réellement disponibles »). La zone DNS `tanguydavid.fr` est hébergée chez **Hostinger**, qui publie un provider officiel (`hostinger/hostinger`). Terraform décrit donc l'entrée DNS qui rend l'API joignable.

| Fichier | Contenu |
|---|---|
| `terraform/providers.tf` | Provider `hostinger/hostinger ~> 0.1` ; token lu dans `HOSTINGER_API_TOKEN` |
| `terraform/variables.tf` | Zone, sous-domaine, IPv4/IPv6 du serveur, TTL |
| `terraform/main.tf` | Enregistrements `A` et `AAAA` pour `api.tanguydavid.fr`, avec `overwrite = false` |
| `terraform/outputs.tf` | Nom de domaine, URL de santé de l'API, valeurs DNS |
| `terraform/.terraform.lock.hcl` | Version exacte du provider, versionnée pour la reproductibilité |
| `terraform/.gitignore` | Exclut `.terraform/` et `*.tfstate` (l'état peut contenir des données sensibles) |

**Vérifications préalables** (DNS public, en lecture seule) : aucun enregistrement `api.tanguydavid.fr` existant, pas de wildcard, serveurs DNS Hostinger (`dns-parking.com`).

**Commandes**, depuis `deploiement/terraform/` :

```bash
# Token saisi sans affichage ni historique, jamais écrit sur disque
read -rsp "Token Hostinger : " HOSTINGER_API_TOKEN && export HOSTINGER_API_TOKEN

terraform init                # télécharge le provider, crée .terraform.lock.hcl
terraform validate            # vérifie la syntaxe
terraform plan -out=tfplan    # affiche et enregistre les changements prévus
terraform apply tfplan        # applique exactement le plan relu
terraform output              # affiche le domaine et l'URL de l'API
```

**Résultat du plan :** `Plan: 2 to add, 0 to change, 0 to destroy`, soit les enregistrements `api` A (`45.155.170.40`) et AAAA (`2a09:6382:4000:2:45:155:170:40`). Aucun autre enregistrement de la zone n'est concerné.

**Résultat de l'application :** `Apply complete! Resources: 2 added, 0 changed, 0 destroyed.`

**Vérification après application :**

```bash
dig +short api.tanguydavid.fr A
dig +short api.tanguydavid.fr AAAA
# → 45.155.170.40
# → 2a09:6382:4000:2:45:155:170:40
```

**Retour arrière :** `terraform destroy` supprime uniquement les deux enregistrements créés par Terraform.

## 3. Accès SSH

| Clé | Utilisée par | Compte | Droits |
|---|---|---|---|
| Clé personnelle de l'administrateur (`~/.ssh/id_ed25519`) | Ansible, depuis le poste d'administration | `root` | Administration ; ajoutée à `authorized_keys` par `ssh-copy-id`, le mot de passe root reste inchangé |
| Clé de déploiement (`~/.ssh/souverainrecrut_deploy`, ed25519, sans passphrase) | GitLab CI | `souverainrecrut` | Groupe `docker`, **sans sudo**, mot de passe verrouillé |

Un **compte dédié** au projet est utilisé : il peut être révoqué indépendamment des autres comptes du serveur, et ses connexions sont traçables séparément dans les journaux SSH.

> Le groupe `docker` donne un contrôle équivalent à root sur les conteneurs. C'est le compromis habituel pour un déploiement par Docker Compose. Il est limité ici par une clé dédiée, sans sudo, utilisée uniquement par la pipeline.

## 4. Ansible — préparation du serveur (§4.3)

| Fichier | Contenu |
|---|---|
| `ansible/inventory.ini` | Groupe `production` : le VPS, connexion `root` par clé |
| `ansible/ansible.cfg` | Inventaire par défaut, vérification de l'empreinte SSH, *pipelining* |
| `ansible/group_vars/production.yml` | Utilisateur de déploiement, répertoire, conteneur et réseau Caddy, domaine |
| `ansible/templates/souverainrecrut.caddy.j2` | Site Caddy `api.tanguydavid.fr` → `souverainrecrut-api:4000` |
| `ansible/playbook.yml` | Tâches de préparation |

| Exigence §4.3 | Tâche | Garde-fou sur un serveur partagé |
|---|---|---|
| Mettre à jour le système, installer les dépendances | Index apt, `ca-certificates`, `curl`, `gnupg`, `acl` ; mises à jour de **sécurité** automatiques (`unattended-upgrades`) | Pas d'`apt upgrade` complet ni de redémarrage automatique, qui interrompraient les services hébergés |
| Installer Docker Engine + Compose | Dépôt officiel Docker (`deb822_repository`) | Exécuté **uniquement si Docker est absent** |
| Activer et démarrer Docker | `systemd_service: state=started` | Ne redémarre jamais un service déjà actif |
| Créer le répertoire de déploiement | `/opt/souverainrecrut` (`souverainrecrut`, `0750`) | — |
| Exposition HTTPS | Fichier de site Caddy dédié, `caddy validate` puis `caddy reload` | En cas d'échec, le fichier est **retiré automatiquement** (`block`/`rescue`) |
| Vérifier le fonctionnement | `docker ps` exécuté en tant qu'utilisateur de déploiement | — |

```bash
cd deploiement/ansible
ansible production -m ping                    # connectivité
ansible-playbook playbook.yml --check --diff  # simulation : rien n'est modifié
ansible-playbook playbook.yml --diff          # application
```

| Exécution | Résultat |
|---|---|
| Simulation | `changed=6 failed=0` : acl, utilisateur, clé, répertoire, site Caddy, index apt. Docker *skipped* car déjà présent ([rapport](reports/ansible-check-2026-11-09.txt)) |
| Application rejouée | `changed=0 failed=0` : **idempotence** vérifiée ([rapport](reports/ansible-apply-2026-11-09.txt)) |
| Vérifications | Connexion `souverainrecrut` par clé OK ; site existant `tanguydavid.fr` toujours en 200 ; certificat Let's Encrypt obtenu pour `api.tanguydavid.fr` |

## 5. Docker Compose — API + PostgreSQL (§5.2)

Fichiers : [`deployment/docker-compose.yml`](deployment/docker-compose.yml), [`deployment/.env.example`](deployment/.env.example). Sur le serveur : `/opt/souverainrecrut/`.

| Exigence §5.2 | Mise en œuvre |
|---|---|
| Image versionnée Docker Hub | `${BACKEND_IMAGE}:${BACKEND_TAG}`, tag `<version>-<sha7>` publié par Jenkins, jamais `latest` |
| Variables API et Prisma | `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`, `API_VERSION`, `FRONTEND_URL` ; les secrets viennent du `.env` (droits 600, non versionné) |
| Volume persistant PostgreSQL | Volume nommé `db_data`, conservé lors des mises à jour et des rollbacks |
| Réseau Docker adapté | `backend` (**interne**, sans accès Internet) pour API ↔ PostgreSQL ; `web` (externe) pour Caddy ↔ API, alias `souverainrecrut-api` ; **aucun port publié** |
| Redémarrage | `restart: unless-stopped` (API et base) |
| Contrôles de santé | PostgreSQL : `pg_isready` ; API : healthcheck de l'image sur `/v1/health` |
| Migrations maîtrisées | Service ponctuel `migrate` (`prisma migrate deploy`) : applique uniquement les migrations versionnées dans l'image, après que la base est *healthy*. L'API ne démarre que si les migrations réussissent (`service_completed_successfully`) |
| Journaux | Rotation `json-file` (3 × 10 Mo) |

**Test local avant déploiement** (avec l'image `1.0.0-7fa9454`) :
- migrations appliquées (`All migrations have been successfully applied`) ;
- API *healthy* ;
- `/v1/ready` → `READY / CONNECTED` via l'alias `souverainrecrut-api` ;
- redéploiement : `No pending migrations to apply` ;
- PostgreSQL injoignable depuis le réseau `web`.

> Le script `prisma/seed.ts` **n'est pas exécuté en production** : il vide toutes les tables avant d'insérer des données de démonstration.

## 6. Pipeline GitLab CI/CD (§4.4 et §5.3)

Fichier : [`.gitlab-ci.yml`](.gitlab-ci.yml). Il s'exécute sur GitLab.com (runners hébergés), dans le projet privé [**`tanguy-cicd/souverainrecrut-deploiement`**](https://gitlab.com/tanguy-cicd/souverainrecrut-deploiement) (accès sur invitation, rôle *Reporter*).

Ce dossier `deploiement/` est publié à la racine du projet GitLab depuis le dépôt GitHub. Le dépôt GitHub reste la source unique :

```bash
git remote add gitlab git@gitlab.com:tanguy-cicd/souverainrecrut-deploiement.git   # une seule fois
git subtree push --prefix deploiement gitlab main                                   # à chaque mise à jour
```

| Job | Rôle |
|---|---|
| `validate-tag` | Format `<version>-<sha7>` obligatoire (`latest` refusé) ; existence du tag vérifiée sur Docker Hub |
| `deploy-production` | `scp` du fichier Compose ; `pg_dump` de la base (5 sauvegardes conservées) ; mise à jour de `BACKEND_TAG` ; `docker compose pull` puis `up -d --wait` ; **retour automatique au tag précédent en cas d'échec** ; journal `deploy-history.log` |
| `verify-api` | `GET https://api.tanguydavid.fr/v1/ready` doit répondre `READY` (10 tentatives) |

- **Déclenchement :** **automatique par Jenkins** après un build vert (appel API avec un jeton de déclenchement, tag en input `backend_tag`). Il reste possible **à la main** (*New pipeline*, *Re-deploy*) pour un retour arrière. Le tag est un **input** de pipeline (`spec:inputs`), le mécanisme recommandé par GitLab à la place des variables saisies à la main.
- **Concurrence :** `resource_group: production`, donc un seul déploiement à la fois.
- **Historique :** environnement GitLab `production`, avec bouton *Re-deploy* sur un déploiement antérieur.

**Variables CI/CD** (*Settings → CI/CD → Variables*) :

| Variable | Type / options | Contenu |
|---|---|---|
| `SSH_PRIVATE_KEY` | File, Protected | Clé privée `souverainrecrut_deploy` |
| `SSH_KNOWN_HOSTS` | Protected | Sortie de `ssh-keyscan 45.155.170.40` (vérification stricte de l'hôte) |
| `DEPLOY_HOST` | Protected | `45.155.170.40` |
| `DEPLOY_USER` | Protected | `souverainrecrut` |
| `DOCKERHUB_USER` / `DOCKERHUB_TOKEN` | — | **Non créées** : l'image est publique (la connexion est sautée si elles sont absentes). À ajouter, avec un token en lecture seule, si l'image devient privée. |

Les secrets applicatifs (`JWT_SECRET`, `POSTGRES_PASSWORD`) **ne sont pas** dans GitLab : ils restent dans `/opt/souverainrecrut/.env` sur le serveur, et la pipeline ne modifie que `BACKEND_TAG`.

**Tests locaux du comportement** (Compose v5) :
- `up --wait` réussit au premier déploiement comme au redéploiement ;
- `pg_dump` est fonctionnel ;
- un tag défaillant fait échouer `up --wait`, ce qui déclenche le retour au tag précédent.

**Premier déploiement par la pipeline** (`backend_tag` = `1.0.0-7fa9454`) :
- les 3 jobs sont verts ;
- `deploy-history.log` : `1.0.0-7fa9454 -> 1.0.0-7fa9454 OK (pipeline 3045841142)` ;
- sauvegarde `backups/db-20261109-154240-avant-1.0.0-7fa9454.sql.gz` créée ;
- API `READY / CONNECTED`.

**Problèmes rencontrés et corrections :**

| Symptôme | Cause | Correction |
|---|---|---|
| Pipeline en `error` sans étape | Compte GitLab non vérifié (runners partagés) | Vérification d'identité du compte |
| `script config should be a string` | Une ligne `echo "… : …"` interprétée par YAML comme une paire clé/valeur | Ligne mise entre guillemets ; contrôle automatique de toutes les lignes de script |
| Champ du tag absent du formulaire | Les variables saisies au lancement sont désactivées par défaut sur les projets récents | Tag passé en **input** de pipeline (`spec:inputs`) |
| `Load key …: error in libcrypto` | Clé collée dans la variable sans saut de ligne final et/ou avec des fins de ligne Windows | La pipeline normalise la clé et vérifie sa lisibilité (`ssh-keygen -y`) avant de se connecter |
| Clé privée visible dans une capture | Valeur de variable révélée pendant le diagnostic | **Rotation** de la clé (voir `documentation/gestion-des-secrets.md` §4.1) ; `authorized_keys` géré en mode exclusif par Ansible |

## 7. Serveur d'intégration continue (VPS 2)

Jenkins et SonarQube tournent sur un **second VPS, dédié à la CI** (`185.216.25.110`, Ubuntu 24.04), distinct du serveur de production. C'est la bonne pratique de séparation des environnements :
- la CI n'a **aucun accès** à la production ;
- les builds ne consomment pas les ressources de l'API ;
- chaque serveur peut évoluer indépendamment de l'autre.

**Interaction entre les deux VPS, sans lien direct :** VPS 2 → `docker push` → Docker Hub → `docker pull` ← VPS 1 (commandé par GitLab).

| Brique | Fichiers | Résultat |
|---|---|---|
| Terraform | `terraform/` : ressources `ci_ipv4` et `ci_ipv6` (`for_each` sur `jenkins`, `sonar`) | `4 to add, 0 to change, 0 to destroy` |
| Ansible | `ansible/inventory.ini` (groupe `[ci]`), `ansible/playbook-ci.yml`, `ansible/group_vars/ci.yml`, `ansible/templates/ci-Caddyfile.j2`, `ansible/tasks/docker.yml` (commun avec la production) | Simulation : `failed=0` ([rapport](reports/ansible-ci-check-2026-11-10.txt)) ; serveur préparé ; lab démarré par `--tags start` |
| Lab | `../integration-continue/lab/docker-compose.yml` + `docker-compose.vps.yml` | Jenkins et SonarQube en HTTPS, limites mémoire, pare-feu 22/80/443 |

> Le serveur venant d'être réinstallé, aucune sauvegarde préalable n'était nécessaire. Son empreinte SSH, modifiée par la réinstallation, a été mise à jour dans `known_hosts` après confirmation.
