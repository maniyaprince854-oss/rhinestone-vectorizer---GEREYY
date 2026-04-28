# Deployment Guide

Put this tool online for free using GitHub Pages.

## Prerequisites

- GitHub account: https://github.com (free)
- [Git installed](https://git-scm.com/downloads)
- [Node.js installed](https://nodejs.org) (version 18 or newer)

## Step 1: Test Locally

Verify everything works before deploying:

**Windows:** Double-click `start.bat`
**Mac/Linux:** Run `./start.sh`

Or manually:
```bash
npm install
npm run dev
```

The app should open at http://localhost:5173

## Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. **Repository name**: `rhinestone-vectorizer` (or your preferred name)
3. Set to **Public** (required for free GitHub Pages)
4. Do NOT check "Add a README" (one is included)
5. Click **Create repository**

## Step 3: Update Base Path

Open `vite.config.js` and verify the base path matches your repo name:

```js
base: process.env.NODE_ENV === 'production' ? '/rhinestone-vectorizer/' : '/',
```

If your repo is named differently (e.g. `my-tool`):

```js
base: process.env.NODE_ENV === 'production' ? '/my-tool/' : '/',
```

The leading and trailing slashes are required.

## Step 4: Push to GitHub

In a terminal in the project folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPO-NAME` with your actual values.

If asked for a password, use a [Personal Access Token](https://github.com/settings/tokens) (classic, with `repo` scope).

## Step 5: Enable GitHub Pages

1. Open your repository on GitHub
2. Click the **Settings** tab
3. In the left sidebar, click **Pages**
4. Under "Build and deployment" → **Source**, select **GitHub Actions**

## Step 6: Wait for Deployment

1. Click the **Actions** tab in your repo
2. Watch the "Deploy to GitHub Pages" workflow run (takes 1-2 minutes)
3. Wait for the green checkmark

## Step 7: Live!

Your site is at:
```
https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/
```

## Updating Later

```bash
git add .
git commit -m "Description of changes"
git push
```

The Action automatically rebuilds and redeploys.

## Troubleshooting

**404 / page not found**
- Verify `base` in `vite.config.js` matches your repo name exactly (with slashes)
- Make sure Pages source is "GitHub Actions" not "Deploy from branch"

**Build fails in Actions**
- Click Actions tab → failed run → read the error log
- Try running `npm install` and `npm run build` locally to reproduce

**Blank page after deploy**
- Hard refresh: Ctrl+Shift+R
- Check browser console (F12) for errors

**Want a custom domain?**
Settings → Pages → Custom domain. Configure DNS per GitHub's instructions.

## Alternative Hosts

This is a pure static site. Works on:
- **Vercel** — connect GitHub repo, zero config
- **Netlify** — drag & drop the `dist/` folder after `npm run build`
- **Cloudflare Pages** — connect GitHub repo
- **Hostinger / any static host** — upload `dist/` folder contents

For non-GitHub hosts, change `vite.config.js` base path back to `/`.
