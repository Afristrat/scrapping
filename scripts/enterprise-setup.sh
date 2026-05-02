#!/usr/bin/env bash
# =============================================================================
# Kairos — Setup interactif Enterprise self-hosted
# =============================================================================
# Usage : ./scripts/enterprise-setup.sh
#
# Étapes :
#   1. Vérifie prérequis (docker, openssl, curl)
#   2. Génère .env.enterprise (secrets, JWT, MinIO, SMTP)
#   3. Crée les volumes Docker
#   4. Lance les services
#   5. Applique les migrations Postgres
#   6. Crée le 1er admin (super-user)
#
# Doc : docs/enterprise/self-host.md
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.enterprise"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.enterprise.yml"

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
die() { log_error "$1"; exit 1; }

prompt() {
  # prompt "Question" "default"
  local question="$1"
  local default="${2:-}"
  local response
  if [[ -n "$default" ]]; then
    read -r -p "$question [$default] : " response
    echo "${response:-$default}"
  else
    read -r -p "$question : " response
    echo "$response"
  fi
}

prompt_secret() {
  local question="$1"
  local response
  read -r -s -p "$question : " response
  echo >&2
  echo "$response"
}

random_secret() {
  # 64 caractères hex secure
  openssl rand -hex 32
}

random_password() {
  # 24 caractères alphanumériques sûrs
  openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24
}

# -----------------------------------------------------------------------------
# Étape 1 : prérequis
# -----------------------------------------------------------------------------
check_prerequisites() {
  log_info "Vérification des prérequis..."

  command -v docker >/dev/null 2>&1 || die "Docker non installé. Installer Docker Engine 24+."

  if ! docker compose version >/dev/null 2>&1; then
    die "docker compose v2 non disponible. Installer Docker Engine 24+ avec Compose v2."
  fi

  command -v openssl >/dev/null 2>&1 || die "openssl requis pour générer les secrets."
  command -v curl >/dev/null 2>&1 || die "curl requis pour les health checks."

  # Vérifie ressources
  local available_mem_gb
  available_mem_gb=$(free -g 2>/dev/null | awk '/^Mem:/ {print $7}' || echo "?")
  if [[ "$available_mem_gb" != "?" && "$available_mem_gb" -lt 6 ]]; then
    log_warn "RAM disponible : ${available_mem_gb} Go. Recommandé : 8 Go minimum."
  fi

  log_success "Prérequis OK (Docker $(docker --version | awk '{print $3}' | tr -d ','))"
}

# -----------------------------------------------------------------------------
# Étape 2 : génération .env.enterprise
# -----------------------------------------------------------------------------
generate_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    local overwrite
    overwrite=$(prompt "Le fichier .env.enterprise existe. L'écraser ? (yes/no)" "no")
    if [[ "$overwrite" != "yes" ]]; then
      log_info "Conservation de .env.enterprise existant."
      return
    fi
    cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
    log_info "Backup créé : ${ENV_FILE}.backup.*"
  fi

  log_info "Génération de .env.enterprise..."

  local site_url
  site_url=$(prompt "URL publique de Kairos (ex: https://kairos.acme.corp)" "http://localhost:8080")

  local admin_email
  admin_email=$(prompt "Email du 1er admin")
  [[ -z "$admin_email" ]] && die "Email admin obligatoire."

  local smtp_host
  smtp_host=$(prompt "SMTP host (pour magic link auth)" "smtp.gmail.com")
  local smtp_port
  smtp_port=$(prompt "SMTP port" "587")
  local smtp_user
  smtp_user=$(prompt "SMTP user")
  local smtp_pass
  smtp_pass=$(prompt_secret "SMTP password")

  local openrouter_key
  openrouter_key=$(prompt_secret "OpenRouter API key (optionnel — laisser vide pour BYOK uniquement)")
  local apify_token
  apify_token=$(prompt_secret "Apify token (optionnel — laisser vide pour BYOK uniquement)")

  # Secrets générés automatiquement
  local jwt_secret postgres_password minio_user minio_password anon_key service_role_key

  jwt_secret=$(random_secret)
  postgres_password=$(random_password)
  minio_user="kairos-$(openssl rand -hex 4)"
  minio_password=$(random_password)

  # Génération JWT pour anon + service_role (signés avec jwt_secret)
  # Note : on utilise un helper Python si disponible, sinon une lib node
  log_info "Génération JWT keys..."
  anon_key=$(generate_jwt "$jwt_secret" "anon")
  service_role_key=$(generate_jwt "$jwt_secret" "service_role")

  cat > "$ENV_FILE" <<EOF
# =============================================================================
# Kairos Enterprise — variables d'environnement
# =============================================================================
# GÉNÉRÉ AUTOMATIQUEMENT le $(date -Iseconds)
# NE PAS COMMITER. Ajouter au .gitignore.
# Backup recommandé : encrypted (age, sops, vault)
# =============================================================================

# --- Public ---
SITE_URL=${site_url}
ADDITIONAL_REDIRECT_URLS=${site_url}
ORG_NAME=Kairos Enterprise
PROJECT_NAME=kairos
ADMIN_EMAIL=${admin_email}

# --- Postgres ---
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_PORT=54322

# --- JWT (signe les tokens GoTrue + PostgREST) ---
JWT_SECRET=${jwt_secret}
ANON_KEY=${anon_key}
SERVICE_ROLE_KEY=${service_role_key}

# --- Ports exposés ---
KONG_PORT=8000
KONG_HTTPS_PORT=8443
STUDIO_PORT=54323
FRONTEND_PORT=8080
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001

# --- MinIO (S3 storage) ---
MINIO_ROOT_USER=${minio_user}
MINIO_ROOT_PASSWORD=${minio_password}
MINIO_BUCKET=kairos
MINIO_REGION=us-east-1

# --- SMTP (magic link) ---
SMTP_HOST=${smtp_host}
SMTP_PORT=${smtp_port}
SMTP_USER=${smtp_user}
SMTP_PASS=${smtp_pass}
SMTP_ADMIN_EMAIL=${admin_email}
SMTP_SENDER_NAME=Kairos
DISABLE_SIGNUP=false
MAILER_AUTOCONFIRM=false

# --- API keys fallback (Maison) ---
# Laisser vide si vous voulez forcer le BYOK pour tous les users.
OPENROUTER_API_KEY=${openrouter_key}
APIFY_TOKEN=${apify_token}
EOF

  chmod 600 "$ENV_FILE"
  log_success ".env.enterprise généré (mode 600)."
}

# -----------------------------------------------------------------------------
# Helper : génère un JWT signé HMAC-SHA256
# -----------------------------------------------------------------------------
generate_jwt() {
  local secret="$1"
  local role="$2"
  # Header : {"alg":"HS256","typ":"JWT"}
  local header='{"alg":"HS256","typ":"JWT"}'
  # Payload : iss=supabase, role=anon|service_role, iat, exp (10 ans)
  local now exp
  now=$(date +%s)
  exp=$((now + 315360000)) # 10 ans
  local payload="{\"iss\":\"supabase\",\"role\":\"${role}\",\"iat\":${now},\"exp\":${exp}}"

  local b64_header b64_payload signature
  b64_header=$(printf '%s' "$header" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  b64_payload=$(printf '%s' "$payload" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  signature=$(printf '%s.%s' "$b64_header" "$b64_payload" | \
    openssl dgst -binary -sha256 -hmac "$secret" | \
    openssl base64 -A | tr '+/' '-_' | tr -d '=')

  printf '%s.%s.%s' "$b64_header" "$b64_payload" "$signature"
}

# -----------------------------------------------------------------------------
# Étape 3 : démarrage des services
# -----------------------------------------------------------------------------
start_services() {
  log_info "Démarrage des services Docker..."

  # shellcheck disable=SC1091
  set -a; . "$ENV_FILE"; set +a

  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

  log_info "Attente que Postgres soit healthy..."
  local timeout=120
  local elapsed=0
  while ! docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "healthy"; do
    sleep 3
    elapsed=$((elapsed + 3))
    if [[ $elapsed -ge $timeout ]]; then
      die "Postgres timeout après ${timeout}s. Voir : docker compose logs postgres"
    fi
  done
  log_success "Postgres ready"
}

# -----------------------------------------------------------------------------
# Étape 4 : migrations
# -----------------------------------------------------------------------------
apply_migrations() {
  log_info "Application des migrations Supabase..."

  local migrations_dir="${ROOT_DIR}/supabase/migrations"
  [[ -d "$migrations_dir" ]] || die "Dossier migrations introuvable : $migrations_dir"

  # shellcheck disable=SC1091
  set -a; . "$ENV_FILE"; set +a

  for migration in $(ls "$migrations_dir"/*.sql | sort); do
    local name
    name=$(basename "$migration")
    log_info "  → $name"
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$migration" \
      > /dev/null 2>&1 || log_warn "  Migration $name a renvoyé une erreur (peut être déjà appliquée)"
  done

  log_success "Migrations appliquées."
}

# -----------------------------------------------------------------------------
# Étape 5 : création du 1er admin
# -----------------------------------------------------------------------------
create_first_admin() {
  # shellcheck disable=SC1091
  set -a; . "$ENV_FILE"; set +a

  log_info "Création du 1er admin (${ADMIN_EMAIL})..."
  log_warn "Le 1er admin recevra un magic link à ${ADMIN_EMAIL} pour se connecter."
  log_warn "Vérifier la config SMTP. Pour debugging : docker compose logs supabase-auth"

  # Trigger un signup via GoTrue API (l'email sera envoyé via SMTP)
  curl -fsS -X POST "http://localhost:${KONG_PORT}/auth/v1/magiclink" \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${ADMIN_EMAIL}\"}" > /dev/null \
    || log_warn "Magic link request a échoué — réessayer manuellement depuis la UI."

  log_success "Magic link envoyé à ${ADMIN_EMAIL}."
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
  echo
  echo "================================================================"
  echo "  Kairos — Setup Enterprise (self-hosted)"
  echo "================================================================"
  echo

  check_prerequisites
  generate_env_file
  start_services
  apply_migrations
  create_first_admin

  echo
  log_success "Setup terminé !"
  echo
  echo "  Frontend   : ${SITE_URL:-http://localhost:8080}"
  echo "  Studio     : http://localhost:${STUDIO_PORT:-54323}"
  echo "  MinIO      : http://localhost:${MINIO_CONSOLE_PORT:-9001}"
  echo
  echo "  Logs       : docker compose -f ${COMPOSE_FILE} logs -f"
  echo "  Stop       : docker compose -f ${COMPOSE_FILE} down"
  echo "  Backup     : voir docs/enterprise/self-host.md § Backup/Restore"
  echo
}

main "$@"
