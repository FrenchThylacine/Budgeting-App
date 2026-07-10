# Premium Budget App

A Vite + React budget dashboard with recurring budget suggestions, dual-currency support, and analytics.

## Local development

Install dependencies once:

```bash
npm ci
```

Run the app locally:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Netlify deployment

This repository includes a GitHub Actions workflow at `.github/workflows/deploy-netlify.yml` to deploy the built `dist` folder to Netlify.

To enable automatic deployment:

1. Create a free Netlify site.
2. Add the following GitHub secrets to the repository:
   - `NETLIFY_AUTH_TOKEN`
   - `NETLIFY_SITE_ID`
3. Push to `main` to trigger the workflow.

If you don't want to host on GitHub Pages, this workflow lets you use Netlify for free hosting while keeping the repository private.
