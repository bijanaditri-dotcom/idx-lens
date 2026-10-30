# Run the repository and publish the dashboard

The GitHub repository is public. Website hosting is separate. This change adds
a static build of the existing visual interface and a GitHub Pages workflow.
The original preview used a clearly labelled demonstration. With the API
export follow-up installed, use [API to public dashboard](api-to-public-dashboard.md)
first: normal builds require `web/data/api-market.json` exported on your PC.
This is periodic snapshot publishing, not a streaming price feed.

## Local dashboard matching the public version

In a new PowerShell terminal at the repository root:

```powershell
Set-Location .\web
npx.cmd --yes pnpm@11.25.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.25.0 run build:pages
npx.cmd --yes pnpm@11.25.0 run preview:pages
```

Open `http://127.0.0.1:4173/idx-lens/`. Leave this terminal open. `Ctrl+C` stops
the local preview. You can keep the existing Python API terminal running;
this demonstration frontend does not require the API or MySQL to be online.

For interface development with live reload, use `dev:pages` instead of the
build/preview pair. Its default local address is
`http://127.0.0.1:5173/idx-lens/`.

No `.env.local`, API bearer token, database password, or ChatGPT login is
needed by the public browser. The local Python exporter reads the private API
token on your PC. The build reads only whitelisted market observations from
its exported JSON file. To deliberately build the illustrative preview, pass
`--mode demo`; missing exports do not trigger a demo fallback.

The existing server-based Next.js mode remains available with `dev:next` on
port 3000. That mode is separate from the static Pages build.

## Enable public hosting

In the repository on GitHub:

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**.
3. The repository already includes `.github/workflows/pages.yml` after this
   patch is committed and pushed; a second workflow template is unnecessary.

Commit and push the changes from the repository root. Inspect the staged-file
check before committing:

```powershell
git add README.md docs/public-dashboard.md web .github/workflows/pages.yml
.\.venv\Scripts\python.exe .\scripts\check_git.py --staged
```

After `PASS`, commit and push:

```powershell
git commit -m "Add public dashboard preview and GitHub Pages deployment"
git push origin main
```

Open **Actions → Publish dashboard**. Wait for both `build` and `deploy` to
pass. GitHub displays the published URL in the deployment and **Settings →
Pages**. The planned project address for this repository is
`https://bijanaditri-dotcom.github.io/idx-lens/`; it becomes usable only after
Pages is enabled and the deployment succeeds.

If the workflow says Pages is not enabled or cannot find a Pages site, check
the Source setting above and rerun **Publish dashboard**. A pending or failed
workflow is not a successful publication. Repository administrators can also
start the workflow using **Run workflow** once its file is on `main`.

Visitors to the published Pages site need neither a ChatGPT account nor your
GitHub login. Standard GitHub Pages hosting is available for public repositories
on GitHub Free. This workflow uses the standard Ubuntu runner and does not
configure paid hosting, paid APIs, or a custom domain.

## What is published

Only `web/dist-pages/` is uploaded by the publishing workflow. It contains
HTML, JavaScript, CSS, the favicon, and `data/market.json`. Credentials and
local runtime files are not copied into this directory. Server API routes,
the Python collector, and the MySQL database are not served by GitHub Pages.

The static build reuses the current dashboard, chart, screener, stock detail,
methodology, CSV export, and browser-local watchlist components. Browser
refresh requests read the published JSON snapshot. Research POST calls and
server-only stock-detail fetches are disabled in this static mode.

The real-data adapter preserves source/fetch timestamps and missing fields.
Observed prices are not guaranteed real time, and no prediction model is
implemented. The local MySQL API token stays out of browser code and public
snapshots. See the connected-data guide for export and publishing commands.

## Build and checks

From `web/`:

```powershell
npx.cmd --yes pnpm@11.25.0 run typecheck:pages
npx.cmd --yes pnpm@11.25.0 test
npx.cmd --yes pnpm@11.25.0 run build:pages
```

The new workflow performs these checks before deployment. Build output is
ignored by Git. The existing backend workflow continues to run separately.
After the first public preview, the data/history and model stages remain the
next substantive project work.

References:

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://vite.dev/guide/static-deploy.html#github-pages
