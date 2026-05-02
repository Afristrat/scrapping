# Kairos — Auto-hébergement Enterprise

> **Add-on Enterprise** (+499 EUR/an). Permet aux clients régulés (banques, défense, santé, secteur public) de déployer Kairos entièrement sur leur infrastructure : data residency, air-gap, conformité interne.

---

## 1. Prérequis

### Matériel

| Ressource | Minimum                  | Recommandé prod                    |
| --------- | ------------------------ | ---------------------------------- |
| CPU       | 4 vCPU                   | 8 vCPU                             |
| RAM       | 8 Go                     | 16 Go                              |
| Disque    | 50 Go SSD                | 200 Go SSD + snapshots             |
| Réseau    | sortie HTTPS optionnelle | sortie HTTPS pour OpenRouter/Apify |

### Logiciel

- **Docker Engine 24+** (avec Compose v2)
- **Linux** : Ubuntu 22.04+, Debian 12+, RHEL 9+ (testé). Windows Server avec WSL2 ou Docker Desktop fonctionne aussi.
- `openssl`, `curl`, `bash` 4+ — disponibles par défaut sur Linux modernes.
- Un serveur SMTP accessible (Sendgrid, Mailgun, Office 365, Postfix interne, etc.) — OBLIGATOIRE pour l'authentification magic link.

### Réseau

Ports à exposer (configurables via `.env.enterprise`) :

| Service      | Port défaut | Rôle                                             |
| ------------ | ----------- | ------------------------------------------------ |
| Frontend     | 8080        | UI Kairos                                        |
| Kong gateway | 8000        | API publique Supabase                            |
| Studio       | 54323       | UI admin (à mettre derrière VPN/IP allow-list)   |
| MinIO        | 9000/9001   | Storage S3 + console (interne uniquement)        |
| Postgres     | 54322       | DB (interne uniquement, ne pas exposer Internet) |

**Recommandation prod** : exposer uniquement le port frontend (443 via reverse proxy TLS — Traefik, Caddy, Nginx Proxy Manager). Tout le reste reste sur le réseau privé.

---

## 2. Installation

### 2.1 — Cloner le repo

```bash
git clone https://github.com/meydeey/theresa-scrap.git kairos
cd kairos
git checkout main # ou un tag stable, ex: v1.0.0
```

### 2.2 — Lancer le setup interactif

```bash
chmod +x scripts/enterprise-setup.sh
./scripts/enterprise-setup.sh
```

Le script vous demandera :

1. **URL publique** de Kairos (ex : `https://kairos.acme.corp`)
2. **Email du 1er admin** (recevra le magic link initial)
3. **Config SMTP** (host, port, user, password)
4. _(Optionnel)_ OpenRouter API key et Apify token — peuvent être configurés plus tard via la UI Settings, par utilisateur (BYOK) ou globalement.

Il génère :

- `.env.enterprise` (mode 600, propriétaire seulement) avec tous les secrets
- Volumes Docker persistants (`kairos-postgres-data`, `kairos-storage-data`, `kairos-minio-data`)
- Démarre les 9 services
- Applique les migrations Postgres
- Envoie un magic link au 1er admin

À la fin du script, ouvrir l'URL frontend, cliquer sur le magic link reçu par email, et créer la première organisation.

### 2.3 — Sans script (manuel)

Pour les ops qui veulent contrôler chaque étape :

```bash
# 1. Copier le template d'environnement
cp .env.example .env.enterprise

# 2. Éditer .env.enterprise (générer JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY via supabase CLI ou jwt.io)
# Voir scripts/enterprise-setup.sh::generate_jwt() pour la logique de génération

# 3. Démarrer les services
docker compose -f docker-compose.enterprise.yml --env-file .env.enterprise up -d

# 4. Vérifier la santé
docker compose -f docker-compose.enterprise.yml ps

# 5. Appliquer les migrations
for f in supabase/migrations/*.sql; do
  docker compose -f docker-compose.enterprise.yml exec -T postgres \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
```

---

## 3. Configuration

### 3.1 — Fichier `.env.enterprise`

Variables critiques (voir `scripts/enterprise-setup.sh` pour la génération automatique) :

| Variable              | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `SITE_URL`            | URL publique (utilisée pour les redirects auth)                    |
| `JWT_SECRET`          | Secret HMAC SHA256 (64 chars hex) — signe ANON_KEY et SERVICE_ROLE |
| `ANON_KEY`            | JWT public (frontend) — role=`anon`                                |
| `SERVICE_ROLE_KEY`    | JWT serveur (edge functions) — role=`service_role`                 |
| `POSTGRES_PASSWORD`   | Mot de passe Postgres (24+ chars)                                  |
| `MINIO_ROOT_USER`     | User MinIO                                                         |
| `MINIO_ROOT_PASSWORD` | Password MinIO (24+ chars)                                         |
| `SMTP_*`              | Serveur email pour magic link                                      |
| `OPENROUTER_API_KEY`  | Fallback Maison (optionnel — sinon BYOK obligatoire)               |
| `APIFY_TOKEN`         | Fallback Maison (optionnel — sinon BYOK obligatoire)               |

**Sécurité** :

- Le fichier est chmod 600 par défaut.
- Pour la prod, encrypter avec `age`, `sops`, `vault` ou un secret manager (AWS Secrets Manager, Azure Key Vault).
- **Ne jamais committer** dans git. Le `.gitignore` du repo contient déjà `.env*`.

### 3.2 — Reverse proxy TLS (recommandé)

Exemple Caddy (`Caddyfile`) :

```caddy
kairos.acme.corp {
    reverse_proxy localhost:8080
    encode gzip zstd
    log {
        output file /var/log/caddy/kairos.log
    }
}
```

Exemple Traefik (labels Docker) à ajouter dans `docker-compose.enterprise.override.yml` :

```yaml
services:
  kairos-frontend:
    labels:
      - traefik.enable=true
      - traefik.http.routers.kairos.rule=Host(`kairos.acme.corp`)
      - traefik.http.routers.kairos.tls.certresolver=letsencrypt
```

### 3.3 — DNS et certificats

- Pointer `kairos.acme.corp` vers l'IP du host Docker.
- Certificat TLS via Let's Encrypt (Caddy/Traefik le gèrent automatiquement).
- En air-gap : utiliser un certificat auto-signé interne et l'ajouter au trust store des navigateurs clients.

---

## 4. Backup / Restore

### 4.1 — Backup quotidien

Script `cron` recommandé (à placer dans `/etc/cron.daily/kairos-backup`) :

```bash
#!/bin/bash
set -e
BACKUP_DIR="/var/backups/kairos/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Postgres
docker compose -f /opt/kairos/docker-compose.enterprise.yml \
  exec -T postgres pg_dumpall -U postgres | gzip > "$BACKUP_DIR/postgres.sql.gz"

# MinIO (mc client embarqué)
docker run --rm --network kairos-net \
  -v "$BACKUP_DIR:/backup" \
  -e MC_HOST_kairos="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc mirror kairos/kairos /backup/minio

# Rotation : conserver 30 jours
find /var/backups/kairos -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \;
```

### 4.2 — Restore

```bash
# 1. Stopper les services
docker compose -f docker-compose.enterprise.yml down

# 2. Vider les volumes (ATTENTION : destructif)
docker volume rm kairos-postgres-data kairos-minio-data

# 3. Redémarrer Postgres et MinIO seuls
docker compose -f docker-compose.enterprise.yml up -d postgres minio

# 4. Restaurer Postgres
gunzip -c /var/backups/kairos/20260501/postgres.sql.gz | \
  docker compose -f docker-compose.enterprise.yml exec -T postgres \
    psql -U postgres

# 5. Restaurer MinIO
docker run --rm --network kairos-net \
  -v /var/backups/kairos/20260501/minio:/backup \
  -e MC_HOST_kairos="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc mirror /backup kairos/kairos

# 6. Redémarrer le reste
docker compose -f docker-compose.enterprise.yml up -d
```

**Test de restore mensuel obligatoire** : un backup non testé n'existe pas.

---

## 5. Mise à jour (upgrade)

### 5.1 — Procédure standard

```bash
cd /opt/kairos

# 1. Backup avant upgrade
/etc/cron.daily/kairos-backup

# 2. Récupérer la nouvelle version
git fetch --tags
git checkout v1.1.0 # ou le tag voulu

# 3. Rebuild + restart
docker compose -f docker-compose.enterprise.yml --env-file .env.enterprise pull
docker compose -f docker-compose.enterprise.yml --env-file .env.enterprise build kairos-frontend
docker compose -f docker-compose.enterprise.yml --env-file .env.enterprise up -d

# 4. Appliquer les nouvelles migrations
for f in supabase/migrations/*.sql; do
  docker compose -f docker-compose.enterprise.yml exec -T postgres \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
```

### 5.2 — Rollback

```bash
git checkout v1.0.0
docker compose -f docker-compose.enterprise.yml down
# Restaurer le backup de PRE-upgrade (voir § 4.2)
docker compose -f docker-compose.enterprise.yml up -d
```

**Migrations non rétrocompatibles** : annoncées dans le CHANGELOG. Si vous downgradez à travers une migration breaking, le restore du backup Postgres est obligatoire.

---

## 6. Support

### 6.1 — Contrat Enterprise (+499 EUR/an)

Inclus :

- **SLA 99,5 %** sur les correctifs critiques (8 h ouvrées en business days)
- **Patches de sécurité** dans les 48 h après divulgation CVE
- **2 sessions de formation/an** (4h chacune, équipe ops + power users)
- **Canal support privé** Slack ou Microsoft Teams
- **Migration assistée** lors des upgrades majeurs (v2.0, etc.)

Non inclus (devis sur demande) :

- Custom integrations (SSO Okta/Azure AD, SAML, LDAP — voir add-on Compliance/Légal +199 EUR/an)
- Hébergement managé sur infra dédiée
- Développements features sur-mesure

### 6.2 — Contact

- Email : `enterprise@kairos.example`
- Telephone (urgences SLA) : fourni au moment du contrat
- Slack/Teams : invité au moment du onboarding

---

## 7. Troubleshooting

### Postgres ne démarre pas

```bash
docker compose -f docker-compose.enterprise.yml logs postgres
```

Causes fréquentes :

- `POSTGRES_PASSWORD` vide ou avec caractères spéciaux mal échappés. Utiliser uniquement `[A-Za-z0-9]`.
- Volume corrompu : `docker volume inspect kairos-postgres-data`. Restore depuis backup.
- Port 54322 déjà occupé : changer `POSTGRES_PORT` dans `.env.enterprise`.

### Magic link non reçu

```bash
docker compose -f docker-compose.enterprise.yml logs supabase-auth | grep -i smtp
```

Causes fréquentes :

- SMTP credentials invalides. Tester avec `swaks --to admin@... --server smtp.host --auth-user user --auth-password pass`.
- Provider rejette les emails sortants depuis l'IP du serveur (Gmail/Office 365 sur résidentiel). Utiliser un service relay (Sendgrid, Mailgun, Postmark).
- `SITE_URL` ne matche pas l'URL réelle dans le navigateur → magic link redirect échoue. Vérifier `ADDITIONAL_REDIRECT_URLS`.

### Edge functions lentes ou timeout

```bash
docker compose -f docker-compose.enterprise.yml logs supabase-functions
```

Causes fréquentes :

- Pas de connectivité Internet pour appeler OpenRouter/Apify (en air-gap → impossible). Self-host un LLM via OpenRouter compatible (vLLM, ollama avec proxy OpenAI-compatible) et configurer `OPENROUTER_API_KEY` pour pointer dessus.
- Quotas API Maison épuisés : configurer le BYOK par utilisateur dans Settings.

### Storage uploads échouent

```bash
docker compose -f docker-compose.enterprise.yml logs supabase-storage minio
```

Causes fréquentes :

- MinIO bucket `kairos` non créé. Le créer manuellement via console MinIO (`http://localhost:9001`) ou avec `mc mb kairos/kairos`.
- ACL bucket trop restrictives. Public-read sur `branding/*` requis (déjà géré par les migrations).

### Frontend affiche "Failed to fetch" sur toutes les requêtes

Causes fréquentes :

- `VITE_SUPABASE_URL` au build ne matche pas l'URL réelle. Le frontend a été buildé avec une URL hardcodée — il faut **rebuild** :

```bash
docker compose -f docker-compose.enterprise.yml --env-file .env.enterprise build --no-cache kairos-frontend
docker compose -f docker-compose.enterprise.yml up -d kairos-frontend
```

- Kong ne route pas correctement : tester `curl http://localhost:8000/auth/v1/health`.

### Problème non listé

1. Récupérer un dump complet : `docker compose -f docker-compose.enterprise.yml logs --no-color > kairos-logs.txt`
2. État des conteneurs : `docker compose -f docker-compose.enterprise.yml ps -a`
3. Versions : `docker --version && docker compose version && cat .env.enterprise | grep -v PASSWORD | grep -v KEY | grep -v SECRET`
4. Envoyer à `enterprise@kairos.example` (les 3 fichiers ci-dessus, **PAS** le `.env.enterprise` complet).

---

## 8. Limitations connues

- **Haute disponibilité non couverte** : la stack actuelle est single-node. Pour HA (Postgres replica, MinIO distributed, multi-frontend behind LB), prévu Wave 7.
- **Monitoring intégré minimal** : un endpoint `/healthz` est exposé sur le frontend. Pour observabilité complète (Prometheus + Grafana + alerting), prévu Wave 7. Workaround : brancher un UptimeRobot externe sur `${SITE_URL}/healthz`.
- **Realtime non testé en self-host** : le service Realtime de Supabase n'est pas inclus dans le bundle (non utilisé par les pages critiques de Kairos en l'état). Si besoin (notifications live), ouvrir un ticket support.
- **Pas de réplication multi-région** : pour data residency stricte (UE+US par exemple), déployer un bundle indépendant par région et router au DNS.
- **pg_cron** : nécessite l'extension dans l'image Postgres (`supabase/postgres` la fournit), mais les jobs ne s'exécutent que sur le primary. Vérifier `SELECT * FROM cron.job;` après setup.

---

## 9. Sécurité — checklist post-installation

- [ ] `.env.enterprise` est en mode 600 et hors git
- [ ] Postgres port (54322) **non exposé** sur Internet (firewall iptables/ufw)
- [ ] Studio (54323) derrière VPN ou IP allow-list — pas accessible publiquement
- [ ] MinIO (9000/9001) interne uniquement
- [ ] Reverse proxy TLS configuré (Caddy/Traefik) avec HSTS
- [ ] Backup quotidien testé (restore validé sur env staging)
- [ ] Logs centralisés (Loki, Datadog, ELK) — au minimum `docker compose logs` archivé
- [ ] Rotation des secrets (JWT_SECRET, MINIO password) tous les 6 mois
- [ ] Mise à jour Docker Engine + images de base mensuelle
- [ ] Audit RLS : `SELECT tablename FROM pg_tables WHERE rowsecurity = false AND schemaname = 'public';` doit retourner 0 lignes
- [ ] OpenRouter/Apify keys stockées chiffrées dans `user_api_keys` (déjà géré par l'app)

---

> Document maintenu par l'équipe Kairos Enterprise.
> Dernière mise à jour : Wave 6.5.
> Versionné dans le repo, voir `git log -- docs/enterprise/self-host.md`.
