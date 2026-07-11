# Budgeting App

A premium personal budget dashboard with built-in recurring expense budgeting, piloting separation, budget approval workflow, and analytics.

## Key features

- Automatic monthly budget suggestion based on active recurring expenses
- Piloting expenses kept separate from normal budget distribution
- Historical period indicator for previous months/weeks
- Clean dashboard cards and analytics charts
- Recurring vs non-recurring expense comparison
- Local data persistence via IndexedDB
- GitHub Pages deployment using GitHub Actions

## Local development

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Start development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
4. Preview production output:
   ```bash
   npm run preview
   ```

## Deployment

This app is configured to deploy automatically via GitHub Actions on push to `main` using the workflow in `.github/workflows/deploy-pages.yml`.

The Vite config supports GitHub Pages deployment by setting the correct base path when running in GitHub Actions.

## Hosting options for private repositories

- GitHub Pages: works for private repositories when Pages is enabled on a paid GitHub plan. The deployed site remains restricted to authorized viewers.
- Netlify or Vercel: can also deploy from a connected private GitHub repository with secure access controls.

## Notes

- A `README.md` has been added to document the project and hosting options.
- The current branch has been verified with `npm test`, `npm run build`, and a local `npm run preview` server.
