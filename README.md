
# Modda

**Premium static file-distribution platform for GitHub Pages.** Publish APKs, mods, and digital downloads with a beautiful admin interface and zero backend required.

![Modda](logo.svg)

---

## ✨ Features

- 🎨 Premium design system — dark/light themes, glassmorphism, micro-interactions
- 📱 Fully responsive — mobile-first, desktop-optimized
- 🔐 Admin panel with session auth, JSON import/export, GitHub file browser
- 🔗 Deep links (`?app=slug`) for sharing specific apps
- ⚡ Static-first — no build step, no server, no dependencies
- 🔍 Search, filter, sort across your entire catalog
- 📋 Copy direct download links with one click

---

## 📁 Folder Structure

```
modda/
├── index.html       # Public storefront
├── admin.html       # Admin dashboard
├── auto.js          # Admin auth + logic
├── app.js           # Public logic
├── style.css        # Design system
├── apps.json        # App catalog (editable)
├── logo.svg         # Primary logo
├── favicon.svg      # Favicon
├── README.md        # This file
└── uploads/         # Place uploaded files here
```

---

## 🚀 Deployment (GitHub Pages)

### Step 1 — Create Repository

Create a new **public** GitHub repository (recommended for GitHub Pages).

### Step 2 — Upload Files

Push all files from this template to the repository's `main` branch.

### Step 3 — Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Under **Source**, select:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
3. Click **Save**

Your site will be live at:
```
https://<username>.github.io/<repo>/
```

### Step 4 — Configure

Edit `apps.json` and `auto.js` with your repository details (see Configuration section below).

---

## ⚙️ Configuration

### GitHub Repo Settings

Edit the `config` block inside `apps.json` **and** the `CONFIG` object at the top of `auto.js`:

```json
"config": {
  "githubUser": "your-username",
  "githubRepo": "modda",
  "branch": "main",
  "siteTitle": "Modda",
  "siteDescription": "Premium file distribution"
}
```

All download URLs are automatically derived from this config:

```
https://<githubUser>.github.io/<githubRepo>/<filePath>
```

**Example:**
- `filePath: "uploads/myapp.apk"`
- Generated URL: `https://yourname.github.io/modda/uploads/myapp.apk`

### SEO / Meta

Update in `index.html`:
- `<title>`
- `<meta name="description">`
- `<meta name="theme-color">`
- Open Graph tags (`og:title`, `og:description`, `og:image`)

---

## 📦 How to Add Applications

### Method 1: Via Admin Panel (Recommended)

1. Visit `https://<your-site>/admin.html`
2. Sign in (default credentials: `admin` / `admin123`)
3. Click **+ Add App** from the sidebar
4. Fill in app details:
   - Name, package name, version, category, developer
   - Icon URL, description, HTML-rich info
   - Screenshots, changelog, tags
5. Click **📁 Fetch from GitHub** to browse the `uploads/` folder
6. Select a file → path/size auto-fill automatically
7. Click **Save**
8. Go to **Import / Export** tab
9. Click **Copy JSON** or **Download file**
10. Commit the exported `apps.json` to your repository

> ⚠️ **Important:** Changes only persist locally until you export and commit `apps.json` back to the repo.

### Method 2: Manual JSON Editing

Add a new object to the `apps` array in `apps.json`:

```json
{
  "id": "my-app",
  "slug": "my-app",
  "name": "My App",
  "icon": "https://...",
  "package": "com.example.myapp",
  "version": "1.0.0",
  "versionCode": 1000,
  "category": "Utilities",
  "developer": "My Name",
  "fileName": "myapp.apk",
  "filePath": "uploads/myapp.apk",
  "fileSize": "15 MB",
  "fileType": "apk",
  "description": "Short description",
  "htmlInfo": "<p>Rich HTML description allowed.</p>",
  "requirements": "Android 8.0+",
  "androidVersion": "8.0 and up",
  "architecture": "arm64-v8a",
  "screenshots": ["https://...", "https://..."],
  "changelog": "Initial release",
  "releaseDate": "2026-08-21",
  "tags": ["utility", "premium"],
  "featured": true,
  "status": "published",
  "downloadCount": 0,
  "websiteUrl": "",
  "telegramUrl": ""
}
```

---

## 🔐 Admin Security (Important!)

> ⚠️ **This is a UI-only gate.** GitHub Pages is purely static — there is NO server-side auth.

The admin login:
- Hashes passwords with SHA-256 in the browser
- Stores session in `localStorage`
- Expires after 8 hours
- **Does not prevent anyone from accessing `admin.html`**

### Changing the Default Password

1. Open browser DevTools console
2. Run this to generate a new hash:
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_NEW_PASSWORD'))
     .then(h => console.log([...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join('')));
   ```
3. Copy the output hash
4. Replace `passwordHash` in the `CONFIG` object at the top of `auto.js`

### For True Security, Consider:

- 🔑 **GitHub OAuth** via Cloudflare Workers / Vercel Edge Functions
- 🛡️ **Cloudflare Access** password-protection layer
- 📝 **GitHub App** for signed, authenticated commits
- 🔒 **Private repository** with token-based access

**Default credentials:**
- Username: `admin`
- Password: `admin123`

---

## 🔗 Deep Links

Share any app directly using the `?app=` parameter:

```
https://yourname.github.io/modda/?app=my-app-slug
```

The public site will automatically open the matching app's detail modal.

---

## 📥 Direct Downloads

Every app has two ways to share files:

1. **Download button** — triggers direct file download
2. **Copy Link button** — copies the direct URL to clipboard

URL format:
```
https://<githubUser>.github.io/<githubRepo>/<url-encoded-filePath>
```

Spaces and special characters in file names are automatically URL-encoded.

---

## 🖼️ Uploading Files

### Via GitHub Web Interface

1. Go to your repo on GitHub.com
2. Navigate to the `uploads/` folder
3. Click **Add file** → **Upload files**
4. Drag & drop your APK/ZIP/PDF/etc.
5. Commit changes

### Via Git

```bash
git add uploads/myapp.apk
git commit -m "Add myapp v1.0"
git push origin main
```

### Via GitHub API (from Admin Panel)

Click **📁 Fetch from GitHub** in the editor to browse and select files already uploaded to `uploads/`.

---

## 🛠️ Development (Optional)

No build tools required. Serve locally with any static server:

```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```

Then visit `http://localhost:8000`.

---

## 🌐 Browser Support

- ✅ Chrome / Edge (latest 2 versions)
- ✅ Firefox (latest 2 versions)
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)
- ❌ Internet Explorer (not supported)

---

## 📜 License

MIT — use freely, credit appreciated.

---

## 🙏 Credits

Built with vanilla HTML5, CSS3, and JavaScript.  
Design inspiration: premium app distribution platforms.  
Hosted on GitHub Pages.

---

**Built with ❤️ for the Modda project.**


