# Modda

A static, GitHub-Pages-friendly file distribution website. Publish APKs and
other downloadable files straight from a GitHub repository — no backend,
no database, no app store.

Modda has two parts:

- **Public panel** (`index.html`) — a browsable, searchable catalog visitors use to find and download files.
- **Admin panel** (`admin.html`) — a login-gated dashboard for managing the catalog and producing the `apps.json` you commit back to the repo.

---

## Folder structure

```
modda/
├── index.html          Public panel (catalog, search, detail pages)
├── admin.html           Admin panel (login, dashboard, editor, import/export)
├── app.js                Public panel JavaScript
├── auto.js                Admin authentication, session handling, and admin logic
├── style.css               Shared design system (CSS variables, components)
├── data/
│   └── apps.json             The application catalog — the single source of truth
├── uploads/
│   └── (your .apk / .zip / .exe / .pdf files go here)
├── assets/
│   ├── logo.svg              Modda logo mark (navigation)
│   ├── favicon.svg           Favicon (badge version of the mark)
│   ├── favicon.ico           Fallback favicon
│   ├── apple-touch-icon.png  iOS home-screen icon
│   └── icon-512.png          Social-share / OG image
└── README.md
```

## Deploying to GitHub Pages

1. Create (or reuse) a GitHub repository and push this folder's contents to it.
2. In the repo, go to **Settings → Pages**, set the source branch (e.g. `main`) and root folder, then save.
3. Your site will be live at `https://USERNAME.github.io/REPOSITORY/`.
4. Open `admin.html` on that URL and go to **Site settings** to enter your GitHub username, repository name, and branch — this is what the app uses to build direct download links and to browse `uploads/` through the GitHub API. It works the same whether the site is served from a custom domain or from a repository subpath, since every path in the app is relative.

## Uploading files

GitHub Pages is static — a browser can't write files into your repository.
Files always go into `uploads/` the normal GitHub way:

- Drag and drop files into `uploads/` on github.com, **or**
- `git add uploads/your-file.apk && git commit && git push` from your machine.

Once a file is pushed, open **admin.html → Uploads browser** and click
**Refresh** to list everything currently in `uploads/` (via the public GitHub
Contents API — public repositories only, and subject to GitHub's anonymous
rate limit). Click a file to auto-fill its name, path, and size into a new
catalog entry, or type a path manually if you'd rather skip the browser.

## Adding or editing an application

1. Open `admin.html` and sign in (see **Admin access** below).
2. Go to **Applications → Add application**, or click **Edit** on an existing row.
3. Fill in the required fields (name, package, category, version, file name, description) — the form validates before it lets you save.
4. Pick the uploaded file from the **Uploads browser**, or type its repo path directly into **Repository path**. The **Direct download URL** field fills in automatically from your Site settings.
5. Use **Preview** to see the public card before publishing, **Duplicate** to clone an entry, and the **Featured** switch to show it on the homepage.
6. Click **Save application**. Changes are kept in this browser only until you export them.

## Exporting and publishing changes

The admin panel edits a copy of the catalog stored in your browser
(`localStorage`) — nothing is written back to GitHub automatically. To
publish:

1. Go to **Import / Export**.
2. Click **Download apps.json** (or **Copy JSON to clipboard**).
3. Replace `data/apps.json` in your repository with the new file and commit/push.
4. The public site reads `data/apps.json` fresh on every load, so the change goes live as soon as GitHub Pages rebuilds (usually under a minute).

**Import** lets you paste or upload a JSON file to load it back into the admin panel — handy for continuing edits on another device, or restoring a previous export. It validates that `apps` is an array and that every entry has an `id` and `name` before replacing the working catalog, and reports what's wrong if it doesn't.

## Changing the GitHub configuration

`data/apps.json` includes a `config` object:

```json
{
  "config": {
    "githubUsername": "your-username",
    "githubRepo": "modda",
    "githubBranch": "main",
    "siteTitle": "Modda",
    "uploadsPath": "uploads"
  },
  "apps": [ ... ]
}
```

Edit these either directly in the JSON or from **admin.html → Site settings**
(which edits the same values in your local working copy — export afterward
to persist them). Every direct download link is generated from this config
plus each app's `filePath`, following the pattern:

```
https://{githubUsername}.github.io/{githubRepo}/{filePath}
```

Filenames with spaces or special characters are URL-encoded automatically.
If an entry sets its own `directDownloadUrl`, that value is used as-is
instead (useful for files hosted elsewhere, or GitHub Releases assets).

## Admin access — please read

`admin.html` is protected by a **frontend-only login gate**: a username and
a SHA-256 password hash stored in `localStorage`. This keeps casual visitors
out of the editor, but it is **not real server-side security** — anyone who
views this static site's source can see how the check works, and GitHub
Pages has no way to enforce access control on its own. Don't rely on this
for anything sensitive.

- Default credentials: `admin` / `modda-admin`. Change them immediately from **admin.html → Site settings → Change admin password** before publishing this site anywhere public.
- Sessions expire after 2 hours of inactivity (stored in `sessionStorage`, cleared on tab close).
- For genuine access control, put `admin.html` behind GitHub OAuth, a GitHub App, or a small backend proxy — none of which are included here, since they require infrastructure beyond static Pages hosting.

## Data model

Each entry in `apps.json` → `apps[]` supports:

`id`, `name`, `slug`, `icon`, `package`, `version`, `versionCode`,
`category`, `developer`, `fileName`, `filePath`, `fileSize`, `fileType`,
`directDownloadUrl`, `description`, `htmlInfo`, `requirements`,
`androidVersion`, `architecture`, `screenshots[]`, `changelog[]`,
`releaseDate`, `tags[]`, `featured`, `status` (`published` / `draft` /
`archived`), `downloadCount`, `websiteUrl`, `telegramUrl`.

`htmlInfo` accepts a small set of safe HTML (paragraphs, lists, links, code)
— it's sanitized on render to strip scripts, event handlers, and other
unsafe content, so don't rely on it for arbitrary markup.

## Local preview

No build step is required. Serve the folder with any static file server, e.g.:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html` and `http://localhost:8080/admin.html`.
(Opening the HTML files directly via `file://` mostly works, but `fetch()`
for `data/apps.json` is blocked by some browsers under `file://` — a local
server avoids that.)
