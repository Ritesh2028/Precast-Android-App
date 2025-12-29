#!/bin/bash

# Git Push Automation Script
# This script automatically adds, commits, and pushes changes to GitHub

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Git Push Automation Script${NC}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not a git repository${NC}"
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${YELLOW}📋 Current branch: ${CURRENT_BRANCH}${NC}"

# Check if there are any changes
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    exit 0
fi

# Show status
echo ""
echo -e "${YELLOW}📊 Current status:${NC}"
git status --short

# Ask for commit message or use default
echo ""
if [ -z "$1" ]; then
    echo -e "${YELLOW}💬 Enter commit message (or press Enter for default):${NC}"
    read -r COMMIT_MSG
    if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="Update: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
else
    COMMIT_MSG="$1"
fi

echo ""
echo -e "${GREEN}📦 Adding all changes...${NC}"
git add .

echo -e "${GREEN}💾 Committing changes...${NC}"
git commit -m "$COMMIT_MSG"

echo ""
echo -e "${GREEN}📤 Pushing to GitHub...${NC}"

# Check if remote exists
if git remote | grep -q "^origin$"; then
    # Push to origin
    if git push origin "$CURRENT_BRANCH"; then
        echo ""
        echo -e "${GREEN}✅ Successfully pushed to GitHub!${NC}"
        echo -e "${GREEN}🌐 Branch: ${CURRENT_BRANCH}${NC}"
    else
        echo ""
        echo -e "${RED}❌ Push failed. You may need to:${NC}"
        echo -e "${YELLOW}   1. Set up remote: git remote add origin <your-repo-url>${NC}"
        echo -e "${YELLOW}   2. Or pull first: git pull origin ${CURRENT_BRANCH}${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ No remote 'origin' configured${NC}"
    echo -e "${YELLOW}💡 To set up remote, run:${NC}"
    echo -e "${YELLOW}   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✨ All done!${NC}"

