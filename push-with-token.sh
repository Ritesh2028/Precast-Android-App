#!/bin/bash

# Push to GitHub using Personal Access Token
# Usage: ./push-with-token.sh [your-token-here]
# Or set TOKEN environment variable: TOKEN=your-token ./push-with-token.sh

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

USERNAME="Ritesh2028"
REPO="Precast-Android-App"

# Get token from argument or environment variable
if [ -n "$1" ]; then
    TOKEN="$1"
elif [ -n "$TOKEN" ]; then
    # Token from environment variable
    TOKEN="$TOKEN"
else
    echo -e "${YELLOW}⚠️  No token provided${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo -e "  ${GREEN}./push-with-token.sh YOUR_TOKEN${NC}"
    echo "  or"
    echo -e "  ${GREEN}TOKEN=YOUR_TOKEN ./push-with-token.sh${NC}"
    echo ""
    echo -e "${YELLOW}To get a token:${NC}"
    echo "  1. Go to: https://github.com/settings/tokens"
    echo "  2. Click 'Generate new token' → 'Generate new token (classic)'"
    echo "  3. Name it: 'Precast App Push'"
    echo "  4. Select scope: ✅ repo (full control)"
    echo "  5. Click 'Generate token' and copy it"
    exit 1
fi

echo -e "${GREEN}🚀 Pushing to GitHub...${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not a git repository${NC}"
    exit 1
fi

# Check if there are changes to commit
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}📊 Staging changes...${NC}"
    git add .
    
    echo -e "${YELLOW}💾 Committing changes...${NC}"
    COMMIT_MSG="${2:-Update: $(date '+%Y-%m-%d %H:%M:%S')}"
    git commit -m "$COMMIT_MSG"
fi

# Set remote URL with token
echo -e "${YELLOW}🔗 Setting up remote...${NC}"
git remote set-url origin https://${USERNAME}:${TOKEN}@github.com/${USERNAME}/${REPO}.git

# Push
echo -e "${YELLOW}📤 Pushing to GitHub...${NC}"
if git push -u origin main 2>&1; then
    echo ""
    echo -e "${GREEN}✅ Successfully pushed to GitHub!${NC}"
    echo -e "${GREEN}🌐 Repository: https://github.com/${USERNAME}/${REPO}${NC}"
else
    echo ""
    echo -e "${RED}❌ Push failed${NC}"
    echo -e "${YELLOW}💡 Make sure your token has 'repo' scope enabled${NC}"
    exit 1
fi

# Reset remote URL (remove token for security)
git remote set-url origin https://github.com/${USERNAME}/${REPO}.git

echo ""
echo -e "${GREEN}✨ All done!${NC}"
