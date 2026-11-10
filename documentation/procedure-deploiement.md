# Procédure de déploiement — API SouverainRecrut

Cette procédure permet à un tiers de reproduire le déploiement. Elle comporte trois parties :
- la **mise en place initiale**, faite une seule fois ;
- le **déploiement courant**, à chaque nouvelle version ;
- un **déploiement manuel de secours**, si GitLab est indisponible.

Architecture : [`architecture.md`](architecture.md) · Retour arrière : [`procedure-rollback.md`](procedure-rollback.md) · Secrets : [`gestion-des-secrets.md`](gestion-des-secrets.md)

## 1. Prérequis

| Élément | Détail |
|---|---|
| Poste d'administration | Git, Terraform ≥ 1.6, Ansible, client SSH |
| Serveur | Ubuntu 24.04, accès root par clé SSH, Docker déjà présent ou installé par Ansible, reverse proxy Caddy (réseau Docker `web`, `Caddyfile` important `sites/*.caddy`) |
| Comptes | Hostinger (zone DNS), GitLab.com (compte vérifié), Docker Hub (image publique `iamkrugs/souverainrecrut-backend`) |
| Image | Un tag `<version>-<sha7>` publié par Jenkins (voir `integration-continue/README.md`) |

## 2. Mise en place initiale (une seule fois)

### 2.1 Sauvegarde de la configuration du serveur

Sur le serveur, en root :

```bash
tar czf /root/backup-avant-souverainrecrut-$(date +%F).tar.gz \
  /root/caddy /root/.ssh /etc/ssh /etc/passwd /etc/group /etc/shadow /etc/sudoers.d
chmod 600 /root/backup-avant-souverainrecrut-*.tar.gz
```

### 2.2 DNS avec Terraform

Depuis `deploiement/terraform/` :

```bash
read -rsp "Token Hostinger : " HOSTINGER_API_TOKEN && export HOSTINGER_API_TOKEN
terraform init && terraform validate
terraform plan -out=tfplan          # attendu : 2 to add, 0 to change, 0 to destroy
terraform apply tfplan
dig +short api.tanguydavid.fr A     # doit renvoyer l'IP du serveur
```

### 2.3 Clés SSH

Depuis le poste d'administration :

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@45.155.170.40                                   # accès Ansible
ssh-keygen -t ed25519 -C "deploy-souverainrecrut" -f ~/.ssh/souverainrecrut_deploy -N ""   # clé de la pipeline
```

### 2.4 Préparation du serveur avec Ansible

Depuis `deploiement/ansible/` :

```bash
ansible production -m ping
ansible-playbook playbook.yml --check --diff   # simulation : relire les changements prévus
ansible-playbook playbook.yml --diff           # application (attendu : failed=0)
ansible-playbook playbook.yml --diff           # 2e exécution : changed=0 (idempotence)
```

Résultat : compte `souverainrecrut` (groupe `docker`, sans sudo), `/opt/souverainrecrut`, site Caddy `api.tanguydavid.fr`.

### 2.5 Configuration de l'application sur le serveur

Envoyer le fichier Compose, depuis la racine du dépôt :

```bash
scp -i ~/.ssh/souverainrecrut_deploy deploiement/deployment/docker-compose.yml \
  souverainrecrut@45.155.170.40:/opt/souverainrecrut/
```

Puis, sur le serveur, avec le compte `souverainrecrut`. Les secrets sont générés sur place et ne quittent jamais le serveur :

```bash
cd /opt/souverainrecrut && umask 077 && printf "BACKEND_IMAGE=iamkrugs/souverainrecrut-backend\nBACKEND_TAG=1.0.0-7fa9454\nPOSTGRES_DB=souverainrecrut\nPOSTGRES_USER=souverainrecrut\nPOSTGRES_PASSWORD=%s\nJWT_SECRET=%s\nFRONTEND_URL=https://tanguydavid.fr\n" "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > .env
docker compose pull && docker compose up -d --wait
```

### 2.6 Projet GitLab

1. Créer le projet privé `souverainrecrut-deploiement`. La branche `main` est protégée par défaut.
2. Publier le dossier `deploiement/` depuis la racine du dépôt GitHub :
   ```bash
   git remote add gitlab git@gitlab.com:tanguy-cicd/souverainrecrut-deploiement.git
   git subtree push --prefix deploiement gitlab main
   ```
3. Créer les variables dans *Settings → CI/CD → Variables*, toutes en **Protected** :

| Variable | Type | Valeur |
|---|---|---|
| `SSH_PRIVATE_KEY` | **File** | Contenu de `~/.ssh/souverainrecrut_deploy` (avec le saut de ligne final) |
| `SSH_KNOWN_HOSTS` | Variable | Sortie de `ssh-keyscan -t ed25519 45.155.170.40`, à comparer à l'empreinte connue (`ssh-keygen -lf -`) |
| `DEPLOY_HOST` | Variable | `45.155.170.40` |
| `DEPLOY_USER` | Variable | `souverainrecrut` |

Ne jamais révéler une valeur de variable pour une capture d'écran.

## 3. Déploiement courant d'une nouvelle version

1. **Publier l'image :** pousser le code sur `Dev`. Jenkins teste, analyse et scanne le code, puis publie `iamkrugs/souverainrecrut-backend:<version>-<sha7>`. Le tag figure dans le nom du build Jenkins et sur Docker Hub.
2. **Déployer :** sur GitLab → *Build → Pipelines → New pipeline* → branche `main` → input **`backend_tag`** = le tag publié → *New pipeline*.
3. **Suivre les 3 jobs :**

| Job | Succès attendu |
|---|---|
| `validate-tag` | `Image validée : iamkrugs/souverainrecrut-backend:<tag>` |
| `deploy-production` | `Sauvegarde : backups/db-…-avant-<tag>.sql.gz`, puis les conteneurs `api` et `db` *healthy* |
| `verify-api` | `API disponible : {"success":true,"data":{"status":"READY",…` |

Si le nouveau tag ne démarre pas (migration ou healthcheck en échec), le job **revient automatiquement au tag précédent** et échoue en le signalant. Voir [`procedure-rollback.md`](procedure-rollback.md).

## 4. Vérifications après déploiement

```bash
curl -s https://api.tanguydavid.fr/v1/health      # "status":"UP"
curl -s https://api.tanguydavid.fr/v1/ready       # "status":"READY","database":"CONNECTED"
```

Sur le serveur (compte `souverainrecrut`, dans `/opt/souverainrecrut`) :

```bash
docker compose ps -a              # api et db healthy, migrate Exited (0)
docker compose images             # tag réellement en service
tail -5 deploy-history.log        # historique : <ancien> -> <nouveau> OK (pipeline <id>)
docker compose logs --tail 50 api
```

## 5. Déploiement manuel de secours (GitLab indisponible)

Sur le serveur, avec le compte `souverainrecrut`, dans `/opt/souverainrecrut`. Ces commandes reproduisent les étapes de la pipeline :

```bash
umask 077
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip > "backups/db-$(date +%Y%m%d-%H%M%S)-avant-<TAG>.sql.gz"
sed -i "s/^BACKEND_TAG=.*/BACKEND_TAG=<TAG>/" .env
docker compose pull && docker compose up -d --wait --wait-timeout 180
echo "$(date -Is) <ANCIEN> -> <TAG> OK (manuel)" >> deploy-history.log
```

## 6. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `validate-tag` : `Tag invalide` | Input `backend_tag` vide ou mal saisi | Relancer avec un tag `<version>-<sha7>` |
| `validate-tag` : `n'existe pas sur Docker Hub` | Image non publiée (pipeline Jenkins en échec) | Vérifier le build Jenkins et l'onglet *Tags* de Docker Hub |
| `SSH_PRIVATE_KEY illisible` | Clé incomplète dans la variable | Recoller la clé complète (BEGIN … END), type *File* |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` absente ou serveur différent | Vérifier l'empreinte du serveur avant de mettre la variable à jour |
| `Permission denied (publickey)` | Clé de la variable différente de celle autorisée sur le serveur | Rejouer Ansible avec la bonne clé publique ; mettre la variable à jour |
| `migrate` en échec | Migration incompatible avec la base | Retour automatique au tag précédent ; analyser `docker compose logs migrate` |
| HTTP 502 sur `api.tanguydavid.fr` | Conteneur `api` arrêté ou non *healthy* | `docker compose ps`, puis `docker compose logs api` |
| Pipeline en `error` sans étape | Compte GitLab non vérifié, ou erreur de syntaxe | Lire le message du badge `error` ; *Build → Pipeline editor → Validate* |

## 7. Serveur d'intégration continue (VPS 2)

Le serveur de CI est séparé de la production (voir [`architecture.md`](architecture.md) §1). Pour le recréer :

```bash
# 1. DNS jenkins / sonar → VPS 2 (deploiement/terraform/)
terraform plan -out=tfplan && terraform apply tfplan

# 2. Préparation : Docker, pare-feu, fichiers du lab (deploiement/ansible/)
ansible-playbook playbook-ci.yml --check --diff
ansible-playbook playbook-ci.yml --diff

# 3. Docker Hub authentifié sur le serveur (token en lecture seule)
ssh -t root@185.216.25.110 'read -rsp "Token : " T && echo && echo "$T" | docker login -u iamkrugs --password-stdin; unset T'

# 4. Démarrage
ansible-playbook playbook-ci.yml --tags start
```

Ensuite :
- configurer Jenkins (*Jenkins URL* = `https://jenkins.tanguydavid.fr/`, credentials `sonar-token` et `dockerhub`, serveur SonarQube, scanner, job), **ou** restaurer les volumes d'une installation existante ;
- créer le webhook GitHub (*Settings → Webhooks*) vers `https://jenkins.tanguydavid.fr/github-webhook/`.
