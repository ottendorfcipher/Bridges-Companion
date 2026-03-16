# GitHub Setup Guide

This guide will help you push Bridge Companion to GitHub as a private repository.

## Prerequisites

- GitHub account (username: ottendorfcipher)
- Git installed on your machine
- GitHub CLI (gh) installed, or personal access token ready

## Initial Setup

### 1. Initialize Git Repository

```bash
cd ~/Desktop/bridge-companion
git init
git add .
git commit -m "Initial commit: Bridge Companion skeleton"
```

### 2. Create Private GitHub Repository

**Option A - Using GitHub CLI (Recommended):**

```bash
# Authenticate if not already
gh auth login

# Create private repository
gh repo create bridge-companion --private --source=. --push
```

**Option B - Using GitHub Web Interface:**

1. Go to https://github.com/new
2. Repository name: `bridge-companion`
3. Description: "PWA for cultural learning experience students - Islamic apologetics and engagement materials"
4. Select **Private**
5. Do NOT initialize with README (we already have one)
6. Click "Create repository"

Then push:
```bash
git remote add origin https://github.com/ottendorfcipher/bridge-companion.git
git branch -M main
git push -u origin main
```

### 3. Verify

Visit https://github.com/ottendorfcipher/bridge-companion to confirm it's private.

## Recommended .gitignore Additions

The current `.gitignore` already includes:
- `node_modules/`
- `dist/`
- `.env` files
- IDE files

You may want to add:
```
# Database (if you want to exclude it from repo)
public/content.db

# Local development
.DS_Store
```

## Repository Settings

### Protect Sensitive Data

Since this contains religious content for mission work:
- ✅ Repository is private
- Consider adding collaborators only as needed
- Enable branch protection if working with a team

### GitHub Pages (Optional)

If you want to deploy via GitHub Pages:
1. Go to Settings → Pages
2. Source: GitHub Actions (for Vite projects)
3. Add workflow file (see below)

## GitHub Actions Workflow (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

perfaith-based learning:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v2
        with:
          path: ./dist
  
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v2
        id: deployment
```

## Ongoing Development

### Daily Workflow

```bash
# Check status
git status

# Add changes
git add .

# Commit with descriptive message
git commit -m "Add TabBar component"

# Push to GitHub
git push
```

### Working with Branches

```bash
# Create feature branch
git checkout -b feature/accordion-component

# Make changes, commit

# Push branch
git push -u origin feature/accordion-component

# Create PR on GitHub, then merge
```

## Collaboration

To add collaborators:
1. Go to Settings → Collaborators
2. Click "Add people"
3. Enter their GitHub username
4. Choose role (Write access for developers)

## Security Notes

- Never commit API keys or sensitive credentials
- Keep repository private for mission-sensitive content
- Consider using GitHub Secrets for any deployment credentials
- Review commit history before making public (if ever needed)

## Backup Strategy

Since this is critical content:
- GitHub serves as primary backup
- Consider local backup of `content.db` separately
- Export database periodically: `sqlite3 content.db .dump > backup.sql`

## Repository Metadata

Consider adding these labels for issue tracking:
- `bug`
- `enhancement`
- `content`
- `design`
- `documentation`

## Contact

Repository owner: @ottendorfcipher
