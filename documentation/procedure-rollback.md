# Procédure de retour arrière (rollback) — API SouverainRecrut

**Objectif :** revenir rapidement à une version antérieure de l'API, et si nécessaire de la base, en cas de problème après un déploiement.

**Principe :** chaque image est identifiée par un tag immuable (`<version>-<sha7>`). Revenir en arrière consiste donc à **redéployer un tag précédent**, jamais à reconstruire une image. La base est sauvegardée automatiquement avant chaque déploiement.

## 1. Choisir la procédure

| Situation | Procédure | Données de la base |
|---|---|---|
| Le nouveau tag ne démarre pas (migration ou healthcheck en échec) | **§2 : automatique**, rien à faire | Intactes |
| Régression fonctionnelle, **sans** migration de base dans la nouvelle version | **§3 : redéployer le tag précédent** | Conservées |
| Régression **avec** une migration qui a modifié la base | **§4 : restaurer la sauvegarde**, puis redéployer le tag précédent | Retour à l'état d'avant le déploiement ; les écritures faites depuis sont perdues |
| Problème de configuration du serveur (Caddy, comptes, SSH) | **§5** | — |

## 2. Retour automatique (pipeline)

Dans le job `deploy-production`, si `docker compose up --wait` échoue avec le nouveau tag, le script :
1. affiche les journaux de `migrate` et `api` ;
2. remet le tag précédent dans `.env` et redémarre ;
3. écrit dans `deploy-history.log` : `<ancien> -> <nouveau> ÉCHEC, retour à <ancien>` ;
4. termine le job **en échec**, ce qui signale l'incident.

**Vérification :** `curl -s https://api.tanguydavid.fr/v1/ready` doit renvoyer `READY`.

## 3. Redéployer le tag précédent

### 3.1 Trouver le tag précédent

| Source | Où |
|---|---|
| GitLab | *Operate → Environments → production* : liste des déploiements avec leur tag |
| Serveur | `tail -5 /opt/souverainrecrut/deploy-history.log` |
| Docker Hub | Onglet *Tags* de `iamkrugs/souverainrecrut-backend` |

### 3.2 Redéployer

**Option A (GitLab, recommandée) :** *Build → Pipelines → New pipeline* → input `backend_tag` = le tag précédent. La pipeline sauvegarde la base, déploie et vérifie l'API.

**Option B (GitLab, un clic) :** *Operate → Environments → production* → sur le déploiement antérieur, bouton **Re-deploy**. Il relance le job `deploy-production` de ce déploiement, avec son tag. Vérifier ensuite l'API à la main (§6), car `verify-api` n'est pas rejoué.

**Option C (manuel, si GitLab est indisponible)**, sur le serveur, compte `souverainrecrut` :

```bash
cd /opt/souverainrecrut
sed -i "s/^BACKEND_TAG=.*/BACKEND_TAG=<TAG_PRECEDENT>/" .env
docker compose pull && docker compose up -d --wait --wait-timeout 180
echo "$(date -Is) rollback manuel -> <TAG_PRECEDENT>" >> deploy-history.log
```

## 4. Restaurer la base, puis redéployer

À utiliser quand la version à annuler a appliqué une migration (`prisma migrate deploy`) : l'ancien code n'est alors plus compatible avec le nouveau schéma.

Sur le serveur, compte `souverainrecrut`, dans `/opt/souverainrecrut` :

```bash
# 1. Identifier la sauvegarde prise juste avant le déploiement à annuler
ls -1t backups/                                   # db-<date>-avant-<tag_annulé>.sql.gz

# 2. Arrêter l'API (plus aucune écriture)
docker compose stop api

# 3. Vider le schéma, puis restaurer la sauvegarde
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
gunzip -c backups/db-<date>-avant-<tag_annulé>.sql.gz \
  | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# 4. Redéployer le tag précédent (§3.2), par exemple en manuel :
sed -i "s/^BACKEND_TAG=.*/BACKEND_TAG=<TAG_PRECEDENT>/" .env
docker compose up -d --wait --wait-timeout 180
```

La sauvegarde contient aussi la table `_prisma_migrations`. Après restauration, `migrate` affiche donc `No pending migrations to apply` pour l'ancien tag.

> **Procédure testée** sur une copie locale de l'environnement (09/11/2026) :
> - une ligne insérée avant la sauvegarde et une autre après ;
> - après restauration, seule la ligne antérieure subsiste ;
> - l'API redémarre `READY / CONNECTED`, et `migrate` ne réapplique rien.

## 5. Configuration du serveur

| Élément | Retour arrière |
|---|---|
| Site Caddy de l'API | En root : `rm /root/caddy/sites/souverainrecrut.caddy && docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile` (les autres services ne sont pas affectés) |
| DNS `api.tanguydavid.fr` | `terraform destroy` dans `deploiement/terraform/` (ne supprime que les deux enregistrements créés) |
| Arrêt complet de l'application | `docker compose down`. Le volume `db_data` est conservé ; ne **pas** ajouter `-v`, qui supprimerait les données |
| Configuration système (SSH, comptes, Caddy) | Archive `/root/backup-avant-souverainrecrut-<date>.tar.gz`, prise avant toute modification |
| Compte de déploiement compromis | Rotation de la clé (`gestion-des-secrets.md` §4.1) : nouvelle clé, Ansible (mode exclusif), variable GitLab |

## 6. Après un rollback

```bash
curl -s https://api.tanguydavid.fr/v1/ready          # READY / CONNECTED
docker compose ps -a && docker compose images        # tag réellement en service
tail -3 deploy-history.log
```

Ensuite :
- **noter l'incident** : tag annulé, cause, procédure appliquée ;
- **corriger dans le code**, puis publier un **nouveau** tag via Jenkins. On ne republie jamais un tag existant.
