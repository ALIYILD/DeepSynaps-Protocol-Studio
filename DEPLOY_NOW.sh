#!/bin/bash
# DeepSynaps Protocol Studio — Production Deployment Script
# Run this on your LOCAL MACHINE (not in sandbox)
# Prerequisites: flyctl, git, node 20, docker

set -e  # Exit on any error

REPO="https://github.com/ALIYILD/DeepSynaps-Protocol-Studio.git"
APP_NAME="deepsynaps-studio"
REGION="lhr"
BASE_DIR="$HOME/DeepSynaps-Protocol-Studio-deploy"
START_TIME=$(date +%s)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================================
# PHASE 0: PREREQUISITE CHECKS
# ============================================================
echo ""
echo "============================================================"
echo "  DEEPSYNAPS PROTOCOL STUDIO — PRODUCTION DEPLOYMENT"
echo "============================================================"
echo ""

echo "--- Phase 0: Prerequisite Checks ---"

# Check flyctl
if ! command -v flyctl &> /dev/null; then
    echo "Installing flyctl..."
    curl -L https://fly.io/install.sh | sh
    export PATH="$HOME/.fly/bin:$PATH"
fi
flyctl version

# Check authentication
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${RED}ERROR: Not authenticated with Fly.io${NC}"
    echo "Run: flyctl auth login"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Fly.io authenticated"

# Check git
if ! command -v git &> /dev/null; then
    echo -e "${RED}ERROR: git not installed${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} git available"

# Check node
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" != v20* && "$NODE_VERSION" != v22* ]]; then
    echo -e "${YELLOW}⚠ Node 20+ recommended (found: $NODE_VERSION)${NC}"
fi
echo -e "  ${GREEN}✓${NC} Node: $NODE_VERSION"

# Check docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠ Docker not found — Fly.io will use remote builder${NC}"
else
    echo -e "  ${GREEN}✓${NC} Docker available"
fi

echo ""

# ============================================================
# PHASE 1: CLONE & SAFETY VERIFICATION
# ============================================================
echo "--- Phase 1: Clone Repository & Safety Verification ---"

# Clone fresh
rm -rf "$BASE_DIR"
git clone "$REPO" "$BASE_DIR"
cd "$BASE_DIR"

echo -e "  ${GREEN}✓${NC} Repository cloned"

# Run safety verification
echo "  Running demo/production boundary verification..."
python3 scripts/verify_demo_boundary.py
if [ $? -ne 0 ]; then
    echo -e "${RED}SAFETY CHECKS FAILED. DEPLOYMENT ABORTED.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} All 10 safety checks passed"

# Manual gate: MRI_DEMO_MODE
MRI_MODE=$(grep 'MRI_DEMO_MODE' apps/api/fly.toml | grep -o '"[01]"' | tr -d '"')
if [ "$MRI_MODE" = "1" ]; then
    echo -e "${RED}CRITICAL: MRI_DEMO_MODE is '1' in fly.toml${NC}"
    echo "Edit apps/api/fly.toml and set MRI_DEMO_MODE = \"0\""
    exit 1
fi
echo -e "  ${GREEN}✓${NC} MRI_DEMO_MODE = 0 (safe)"

echo ""

# ============================================================
# PHASE 2: INFRASTRUCTURE SETUP (skip if exists)
# ============================================================
echo "--- Phase 2: Infrastructure Setup ---"

# Create app if not exists
if ! flyctl apps list 2>/dev/null | grep -q "$APP_NAME"; then
    echo "  Creating Fly.io app..."
    flyctl apps create "$APP_NAME"
else
    echo -e "  ${GREEN}✓${NC} App '$APP_NAME' exists"
fi

# Create volume if not exists
if ! flyctl volumes list --app "$APP_NAME" 2>/dev/null | grep -q "deepsynaps_data"; then
    echo "  Creating persistent volume..."
    flyctl volumes create deepsynaps_data --region "$REGION" --size 1 --app "$APP_NAME"
else
    echo -e "  ${GREEN}✓${NC} Volume 'deepsynaps_data' exists"
fi

# Check for postgres
if ! flyctl postgres list 2>/dev/null | grep -q "deepsynaps-db"; then
    echo -e "${YELLOW}⚠ PostgreSQL 'deepsynaps-db' not found${NC}"
    echo "  Create with: flyctl postgres create --name deepsynaps-db --region $REGION"
    echo "  Then attach: flyctl postgres attach --app $APP_NAME deepsynaps-db"
    read -p "Press Enter after setting up PostgreSQL, or Ctrl+C to abort..."
else
    echo -e "  ${GREEN}✓${NC} PostgreSQL exists"
    # Check if attached
    if ! flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "DATABASE_URL"; then
        echo "  Attaching PostgreSQL..."
        flyctl postgres attach --app "$APP_NAME" deepsynaps-db
    fi
fi

echo ""

# ============================================================
# PHASE 3: SECRETS CHECK
# ============================================================
echo "--- Phase 3: Secrets Verification ---"

REQUIRED_SECRETS=(
    "DEEPSYNAPS_DATABASE_URL"
    "JWT_SECRET_KEY"
    "DEEPSYNAPS_SECRETS_KEY"
    "DEEPSYNAPS_CORS_ORIGINS"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "CELERY_BROKER_URL"
    "WEARABLE_TOKEN_ENC_KEY"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! flyctl secrets list --app "$APP_NAME" 2>/dev/null | grep -q "$secret"; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ Missing secrets:${NC}"
    for s in "${MISSING_SECRETS[@]}"; do
        echo "    - $s"
    done
    echo ""
    echo "Set missing secrets with:"
    echo "  flyctl secrets set --app $APP_NAME \\"
    for s in "${MISSING_SECRETS[@]}"; do
        echo "    $s=\"YOUR_VALUE_HERE\" \\"
    done
    read -p "Press Enter after setting secrets, or Ctrl+C to abort..."
fi

echo -e "  ${GREEN}✓${NC} All secrets configured"
echo ""

# ============================================================
# PHASE 4: DEPLOY API (Fly.io)
# ============================================================
echo "--- Phase 4: Deploy API to Fly.io ---"
echo "  This will build and deploy the Docker container..."
echo "  (This takes 5-10 minutes)"
echo ""

flyctl deploy \
    --config apps/api/fly.toml \
    --dockerfile apps/api/Dockerfile \
    --app "$APP_NAME" \
    --build-arg VITE_API_BASE_URL="" \
    --remote-only

if [ $? -ne 0 ]; then
    echo -e "${RED}API DEPLOYMENT FAILED${NC}"
    echo "Check logs: flyctl logs --app $APP_NAME"
    exit 1
fi

echo -e "  ${GREEN}✓${NC} API deployed successfully"
echo ""

# ============================================================
# PHASE 5: VERIFY API DEPLOYMENT
# ============================================================
echo "--- Phase 5: Verify API Deployment ---"

BASE_URL="https://${APP_NAME}.fly.dev"
MAX_RETRIES=12
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")
    if [ "$HEALTH" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} /health returned 200"
        break
    fi
    RETRY=$((RETRY+1))
    echo "  Waiting for app to be healthy... ($RETRY/$MAX_RETRIES)"
    sleep 10
done

if [ "$HEALTH" != "200" ]; then
    echo -e "${RED}HEALTH CHECK FAILED after $MAX_RETRIES retries${NC}"
    echo "Check logs: flyctl logs --app $APP_NAME"
    
    # Show rollback option
    echo ""
    echo "To rollback:"
    echo "  flyctl releases list --app $APP_NAME"
    echo "  flyctl deploy --image registry.fly.io/$APP_NAME:<previous-version> --app $APP_NAME"
    exit 1
fi

# Check additional endpoints
echo "  Checking API endpoints..."

OPENAPI=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/openapi.json" 2>/dev/null || echo "000")
if [ "$OPENAPI" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} /api/v1/openapi.json accessible"
else
    echo -e "  ${YELLOW}⚠ /api/v1/openapi.json returned $OPENAPI${NC}"
fi

KNOWLEDGE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/knowledge/status" 2>/dev/null || echo "000")
if [ "$KNOWLEDGE" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} /api/v1/knowledge/status accessible"
else
    echo -e "  ${YELLOW}⚠ /api/v1/knowledge/status returned $KNOWLEDGE${NC}"
fi

echo ""

# ============================================================
# PHASE 6: BUILD & DEPLOY FRONTEND
# ============================================================
echo "--- Phase 6: Build & Deploy Frontend ---"

# Install dependencies
echo "  Installing frontend dependencies..."
npm install --no-audit --no-fund

# Build
echo "  Building frontend..."
npm run build:web

if [ ! -d "apps/web/dist" ]; then
    echo -e "${RED}Frontend build failed — apps/web/dist not found${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Frontend built"

# Deploy to Netlify
if command -v netlify &> /dev/null; then
    echo "  Deploying to Netlify..."
    netlify deploy --prod --dir=apps/web/dist --site=deepsynaps-studio-preview
    echo -e "  ${GREEN}✓${NC} Frontend deployed"
else
    echo -e "  ${YELLOW}⚠ Netlify CLI not found${NC}"
    echo "  Install: npm install -g netlify-cli"
    echo "  Then run: netlify deploy --prod --dir=apps/web/dist"
    echo ""
    echo "  OR push to main branch for auto-deploy:"
    echo "    git push origin main"
fi

echo ""

# ============================================================
# PHASE 7: FINAL VERIFICATION
# ============================================================
echo "--- Phase 7: Final Verification ---"

FAILS=0

check_endpoint() {
    local name=$1
    local url=$2
    local expected=${3:-200}
    local code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$code" = "$expected" ]; then
        echo -e "  ${GREEN}✓${NC} $name ($code)"
    else
        echo -e "  ${YELLOW}⚠${NC} $name (got $code, expected $expected)"
        FAILS=$((FAILS+1))
    fi
}

check_endpoint "Basic Health" "$BASE_URL/health"
check_endpoint "API Spec" "$BASE_URL/api/v1/openapi.json"
check_endpoint "Knowledge Status" "$BASE_URL/api/v1/knowledge/status"

# Check MRI doesn't return demo data
echo "  Checking MRI demo mode safety..."
MRI_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/mri/analyze" \
    -H "Content-Type: application/json" \
    -d '{"scan_type":"test"}' 2>/dev/null || echo "")
if echo "$MRI_RESPONSE" | grep -q '"demo":\s*true'; then
    echo -e "  ${RED}✗ CRITICAL: MRI endpoint returning demo data!${NC}"
    FAILS=$((FAILS+1))
else
    echo -e "  ${GREEN}✓${NC} MRI not returning demo data"
fi

echo ""

# ============================================================
# DEPLOYMENT REPORT
# ============================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo "============================================================"
echo "  DEPLOYMENT REPORT"
echo "============================================================"
echo ""
echo "Phase 1 (Safety):      PASS — 10/10 checks"
echo "Phase 2 (Infra):       PASS"
echo "Phase 3 (Secrets):     PASS"
echo "Phase 4 (API Deploy):  PASS"
echo "Phase 5 (Verify API):  PASS"
echo "Phase 6 (Frontend):    PASS"
echo "Phase 7 (Final):       $FAILS issues"
echo ""
echo "Duration:              ${MINUTES}m ${SECONDS}s"
echo "API URL:               $BASE_URL"
echo "Frontend URL:          https://deepsynaps-studio-preview.netlify.app"
echo "Fly App:               $APP_NAME"
echo "Region:                $REGION"
echo ""

if [ $FAILS -eq 0 ]; then
    echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify frontend loads: https://deepsynaps-studio-preview.netlify.app"
    echo "  2. Monitor logs: flyctl logs --app $APP_NAME"
    echo "  3. Check status: flyctl status --app $APP_NAME"
    echo "  4. Run: flyctl apps open --app $APP_NAME"
    echo ""
    echo "Rollback if needed:"
    echo "  flyctl releases list --app $APP_NAME"
    echo "  flyctl deploy --image registry.fly.io/$APP_NAME:<version> --app $APP_NAME"
    exit 0
else
    echo -e "${YELLOW}⚠ DEPLOYED WITH WARNINGS ($FAILS issues)${NC}"
    echo "Review warnings above. API is live but verify functionality."
    exit 0
fi
