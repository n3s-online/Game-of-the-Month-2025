# Deployment Guide for Game of the Month 2025

## SPA Routing Configuration

This application uses **path-based routing** (not hash-based) for SEO benefits. Each game has its own URL path:

- `/` - Homepage (October by default)
- `/january` - Wormhole
- `/february` - Relay
- `/march` - Brick Bop
- `/april` - Kornivore
- `/may` - Star Squad
- `/june` - Snailsweeper
- `/july` - Key Pals
- `/august` - Cascade
- `/september` - Drawn Together
- `/october` - The Bean's Gambit
- `/november` - Coming soon
- `/december` - Coming soon

### Server Configuration Required

Since this is a Single Page Application (SPA), your web server must be configured to serve `index.html` for **all routes** (except static assets).

#### Netlify / Vercel

Create a `_redirects` file in the `public/` directory (already included):

```
/*    /index.html   200
```

Or use `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### Cloudflare Pages

No configuration needed - SPA routing works automatically.

#### GitHub Pages

GitHub Pages doesn't support SPA routing natively. Use the [spa-github-pages](https://github.com/rafgraph/spa-github-pages) workaround.

#### Apache

Add to `.htaccess`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

#### Nginx

Add to your server block:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Backwards Compatibility

The app automatically redirects old hash-based URLs to new path-based URLs:

- `/#February` → `/february`
- `/#March` → `/march`
- etc.

Users with bookmarked hash URLs will be seamlessly redirected.

## SEO Features

### Meta Tags
Each game route has unique:
- Page title
- Meta description
- Open Graph tags (og:title, og:description, og:url, og:image)
- Twitter Card tags

### Sitemap & Robots
- `robots.txt` - Located at `/robots.txt`
- `sitemap.xml` - Located at `/sitemap.xml`

### Canonical URLs
Each page includes a canonical link tag pointing to its absolute URL.

## Testing Locally

Run the dev server:

```bash
npm run dev
```

The Vite dev server is configured to handle SPA routing automatically.

## Building for Production

```bash
npm run build
```

Deploy the contents of the `dist/` folder to your web server with the appropriate SPA routing configuration above.
