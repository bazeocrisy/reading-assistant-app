# Deployment Instructions

## 📦 Repository Contents

This repository contains:
- **index.html** - Complete Reading Assistant application (single file, all-in-one)
- **README.md** - Project documentation and usage guide
- **DEPLOYMENT.md** - This file (deployment and update instructions)

---

## 🌐 GitHub Pages Setup

### Initial Deployment

1. **Repository**: `reading-assistant-app`
2. **Branch**: `main`
3. **Live URL**: https://bazeocrisy.github.io/reading-assistant-app/

### Enable GitHub Pages

1. Go to repository **Settings**
2. Click **Pages** (left sidebar)
3. Configure:
   - **Source**: Deploy from a branch
   - **Branch**: main
   - **Folder**: / (root)
4. Click **Save**
5. Wait 1-2 minutes for deployment

---

## 🔄 How to Update the App

### Method 1: Edit on GitHub (Recommended)

1. Go to https://github.com/bazeocrisy/reading-assistant-app
2. Click **index.html**
3. Click **pencil icon** ✏️ (Edit this file)
4. Make your changes
5. Scroll down and click **"Commit changes"**
6. Wait 1-2 minutes for the site to rebuild
7. Hard refresh your browser: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)

### Method 2: Upload New File

1. Delete old `index.html` (click file → trash icon → commit)
2. Click **"Add file"** → **"Upload files"**
3. Drag your new `index.html` file
4. Click **"Commit changes"**
5. Wait 1-2 minutes

### Method 3: Git Command Line

```bash
git clone https://github.com/bazeocrisy/reading-assistant-app.git
cd reading-assistant-app
# Replace index.html with your new version
git add index.html
git commit -m "Updated Reading Assistant"
git push origin main
```

---

## ⏱️ Deployment Timeline

- **Automatic deployment**: Yes
- **Build time**: 30-90 seconds
- **Total time until live**: 1-2 minutes
- **Cache clearing**: May need hard refresh (Ctrl+Shift+R)

---

## ✅ Verification Steps

After updating:

1. **Wait 2 minutes** for GitHub to rebuild
2. **Clear browser cache**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **Visit**: https://bazeocrisy.github.io/reading-assistant-app/
4. **Test features**:
   - Upload a file
   - Paste text and start reading
   - Try speed control
   - Click Parent Guide button
   - Test on mobile device

---

## 🔍 Check Deployment Status

### In GitHub Actions

1. Go to **Actions** tab in repository
2. See latest workflow run
3. Green checkmark ✅ = success
4. Red X ❌ = failed (check logs)

### In Settings → Pages

Should show: **"Your site is live at https://bazeocrisy.github.io/reading-assistant-app/"**

If not:
- Verify Source is "Deploy from a branch"
- Verify Branch is "main"
- Verify Folder is "/ (root)"
- Click Save and wait 2-3 minutes

---

## 🐛 Troubleshooting

### Site Not Updating?

1. Check Actions tab for deployment status
2. Clear browser cache completely (Ctrl+Shift+R)
3. Try incognito/private mode
4. Wait full 3 minutes (sometimes takes longer)
5. Verify file is named `index.html` (lowercase, exact)

### Site Shows 404?

1. Verify GitHub Pages is enabled (Settings → Pages)
2. Confirm branch is "main" not "master"
3. Verify `index.html` exists in repository root
4. Wait 5 minutes for initial deployment

### Features Not Working?

1. Open browser console (F12) and check for errors
2. Test in Chrome or Safari (best compatibility)
3. Verify file uploaded completely (check file size)
4. Try on different device (desktop vs mobile)
5. Make sure testing on LIVE site, not local file

### Upload/OCR Not Working?

1. **MUST test on live GitHub Pages site** (https://)
2. Local file testing (file:///) won't work due to CORS
3. External libraries require HTTPS to load
4. Camera features require HTTPS

---

## 📱 Testing Checklist

Before sharing with users:

- [ ] File uploads (image, PDF, Word)
- [ ] Camera feature (on mobile)
- [ ] Text paste
- [ ] Start/Pause/Stop buttons
- [ ] Speed control slider
- [ ] Font size buttons
- [ ] Repeat paragraph button
- [ ] Word count display
- [ ] Progress bar
- [ ] Word list saving
- [ ] Parent guide modal
- [ ] Clear text confirmation
- [ ] Mobile responsive layout
- [ ] Cross-browser (Chrome, Safari, Firefox)

---

## 🔐 Security & Performance

- **HTTPS**: Automatic via GitHub Pages (github.io)
- **Processing**: All client-side (in browser)
- **Privacy**: No data collection or server uploads
- **File Size**: ~80-90KB (single HTML file)
- **Load Time**: 2-3 seconds (first visit)
- **CDN Libraries**: Cached after first use
- **Offline**: Works after initial load

---

## 📊 Performance Tips

1. Test locally first (but use local web server, not file://)
2. Keep single version - delete old files
3. Clear cache when testing updates
4. Document changes in commit messages
5. Test on multiple devices after deployment

---

## 🔄 Rollback Procedure

If you need to revert to previous version:

1. Go to repository main page
2. Click **"commits"** (above file list)
3. Find previous working version
4. Click **"<>"** (Browse files at this point)
5. Click **index.html**
6. Click **"Raw"** button
7. Copy all content
8. Return to current main branch
9. Edit index.html and paste old content
10. Commit changes

---

## 📝 Commit Message Format

Use descriptive commit messages:

```
Updated Reading Assistant - [Date]

Changes:
- Added [feature]
- Fixed [bug]
- Improved [aspect]

Tested on: Chrome, Safari, Mobile
```

---

## 🆘 Support

For deployment issues:
- Check GitHub Pages documentation
- Verify repository settings
- Review GitHub Actions logs
- Contact: Transforming Youth, Inc.

---

**Last Updated**: November 2024
**Maintained By**: Transforming Youth, Inc.
