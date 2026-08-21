# Modda

A premium, fully static file-distribution platform for GitHub Pages. Publish APKs, mods, and digital downloads with a beautiful admin interface and zero backend.

![Modda](logo.svg)

## Features

- 🎨 **Premium design system** with dark/light themes, glassmorphism, and micro-interactions
- 📱 **Fully responsive** — mobile-first, desktop-optimized
- 🔐 **Admin panel** with session auth, JSON import/export, and GitHub file browser
- 🔗 **Deep links** (`?app=slug`) for sharing specific apps
- ⚡ **Static-first** — no build step, no server, no dependencies
- 🔍 **Search, filter, sort** across your entire catalog

## Folder Structure
modda/
├── index.html # Public storefront
├── admin.html # Admin dashboard
├── auto.js # Admin auth + logic
├── app.js # Public logic
├── style.css # Design system
├── apps.json # App catalog (editable)
├── logo.svg # Primary logo
├── favicon.svg # Favicon
└── uploads/ # Place uploaded files here

## Deployment

1. **Create a GitHub repository** (public recommended for GitHub Pages).
2. **Enable GitHub Pages** in repository Settings → Pages → Branch: `main`, Folder: `/ (root)`.
3. **Upload files** to the `uploads/` directory via GitHub's web interface or `git push`.
4. **Edit `apps.json`** through the admin panel (see below) or directly in the repo.
5. **Visit** `https://<username>.github.io/<repo>/`.

## Configuration

Edit the top of `auto.js` and the `config` block of `apps.json`:

```json
"config": {
  "githubUser": "your-username",
  "githubRepo": "modda",
  "branch": "main",
  "siteTitle": "Modda"
}

All download URLs are derived from this configuration:
https://<githubUser>.github.io/<githubRepo>/<filePath>
Example: uploads/app.apk → https://you.github.io/modda/uploads/app.apk
Adding Applications
Via Admin Panel
Navigate to admin.html and sign in (default: admin / admin123).
Click + Add App and fill in details.
Click 📁 Fetch from GitHub to browse uploads/ and auto-fill the file path.
Click Save.
Go to Import / Export and copy the JSON.
Commit the new apps.json to your repository.
⚠️ Changes only persist locally until you export and commit apps.json.
Manually
Add a new object to the apps array in apps.json. See the existing entries for the schema.
Admin Security
The admin login is a UI gate only, stored in localStorage with SHA-256 hashing. It is not server-level security — anyone can view admin.html.
For true security:
Use GitHub OAuth via a lightweight function (Vercel/Cloudflare Workers).
Use a GitHub App for signed commits.
Keep admin.html out of the public build, or protect via GitHub Pages with a password-protected private repo + Cloudflare Access.
Default password: admin123
To change it, generate a SHA-256 hash of your new password and replace CONFIG.passwordHash in auto.js:
// In browser console:
crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-pass'))
  .then(h => console.log([...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join('')));
  Deep Links
Share an app directly:
https://you.github.io/modda/?app=modda-demo
The public page will auto-open the matching app modal.
Direct Downloads
Every app card has a Copy Link button. The link format is:
https://<githubUser>.github.io/<githubRepo>/<url-encoded-filePath>
Spaces and special characters are URL-encoded automatically.
Browser Support
All modern browsers: Chrome, Firefox, Safari, Edge (latest 2 versions). No IE support.
License
MIT — use freely, credit appreciated.
Built with ❤️ for the Modda project.
