# Stage 1 — publish a clean source repository

Work in your existing, successful Windows installation. Keep the API running
in its own terminal; run the following commands in a second PowerShell
terminal. Wait until a fresh `PS ...>` prompt appears before pasting commands.
The Stage 1 installer preserves application code and real configuration.

## 1. Open the correct folder

```powershell
Set-Location -LiteralPath 'C:\Users\LOQ\Downloads\idx-lens-mysql-integration(1)\idx-lens-mysql'
Get-Location
Test-Path .\collector\sync_yahoo.py
Test-Path .\api\main.py
Test-Path .\scripts\check_api.py
Select-String -Path .\sql\schema.sql -SimpleMatch 'period_end DATE'
```

The three path checks should return `True`. The schema line should read
`period_end DATE NOT NULL,`. If it still says `DATE NULL`, edit that one line
in VS Code and save it; this corrects the bootstrap source without running
SQL against your existing database. If the installer is still missing,
follow `START_HERE.md` in the downloaded setup kit first. Keep the kit outside
the working project, so its duplicate support files are not committed.

The existing `collector/sync_yahoo.py` should be the corrected HTTP collector,
not the original yfinance version. The tests below will fail clearly if the
older collector is still in place. Keep the schema's previous `period_end DATE
NOT NULL` correction in `sql/schema.sql`; no database re-creation is needed.

## 2. Install development tools into the existing virtual environment

```powershell
.\.venv\Scripts\python.exe -m pip install -r .\requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
```

No activation or PowerShell execution-policy change is needed. The dependency
install uses compatible ranges and does not request a general package upgrade.
The collector requirements no longer install yfinance; an existing yfinance
installation can remain until a later cleanup.

## 3. Run the isolated tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The tests cover bearer authentication, API validation and bar order, source
and fetch timestamps, malformed price data, session boundaries, HTTP retry
behavior, and checking staged credentials. They neither fetch Yahoo data nor
read/write MySQL. They suppress dotenv loading during application imports.

If this fails, keep the failure output for troubleshooting and stop before
committing. Do not replace your working application code just to match a
test. The setup kit was checked against the corrected collector and the API
from the original ZIP, not a live copy of your Windows folder.

## 4. Recheck the actual running API

With MySQL and Uvicorn running:

```powershell
.\.venv\Scripts\python.exe .\scripts\check_api.py --min-quotes 6
```

Expect four `PASS` lines: MySQL health, at least six authenticated quotes,
valid prices/UTC timestamps, and HTTP 401 without a token. The script reads
the token privately from `api/.env` and never prints it. This checks stored
data, not whether the observations are fresh or licensed for redistribution.

If Uvicorn was stopped, restart it in the first terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir .\api --env-file .\api\.env --host 127.0.0.1 --port 8000
```

## 5. Record the working package versions

After both test steps pass:

```powershell
.\.venv\Scripts\python.exe .\scripts\freeze_environment.py
```

On this installation it should write
`requirements-windows-py312.lock.txt`. The file contains package names and
versions only, without package URLs, environment values, or passwords. Commit
it as a record of the verified Windows environment. Use the normal
`requirements.txt` for a different OS; GitHub checks use the development
requirements on both platforms.

## 6. Check Git

```powershell
git --version
```

If Git is missing, install [Git for Windows](https://git-scm.com/install/windows),
restart VS Code, and open a terminal in the project root again. Restart the
API too if needed. For this new ZIP-based project, initialize Git:

```powershell
git init -b main
```

If this folder already has a Git repository, retain its history and skip
initialization. These first-commit instructions assume no previous published
commits containing secrets.

Set the author for this project. Replace both examples with your actual
GitHub username and the exact private/noreply email from GitHub Settings →
Emails before running:

```powershell
git config user.name 'YOUR_GITHUB_USERNAME'
git config user.email 'YOUR_GITHUB_NOREPLY_EMAIL'
```

These values describe commit authorship. They are not your login password.

## 7. Confirm exclusions and stage the source

```powershell
git check-ignore -v collector/.env api/.env .venv/ collector/__pycache__/sync_yahoo.cpython-313.pyc
git add .
git diff --cached --name-only
.\.venv\Scripts\python.exe .\scripts\check_git.py --staged
```

The first command should show ignore rules for local configuration,
environment, and cache paths. The filename list should include application
source, `.env.example` templates, the schema, docs, requirements, tests, and
the GitHub workflow. Real `.env` files, `.venv`, `__pycache__`, `.bak` files,
database exports, and the setup-kit ZIP must be absent.

The final check should print `PASS`. It checks the staged bytes as well as
filenames, so editing a secret out of your working copy alone is insufficient;
stage the corrected file again. It reports filenames/reasons, not secrets.
It is a focused check, so also review which files will be published.

If `.env` files or old cache files were staged before installing the kit,
unstage them without deleting local copies:

```powershell
git rm --cached --ignore-unmatch -- collector/.env api/.env
git rm -r --cached --ignore-unmatch -- collector/__pycache__ api/__pycache__ .venv
```

Then stage the intended files again and rerun the check. If a secret has ever
been pushed in earlier history, removing it from the next commit does not
remove the old value; rotate it and resolve the history before publication.

## 8. Create the first local commit

Only after the checks pass:

```powershell
git commit -m "Prepare working IDX Lens backend for GitHub"
git status --short
```

An empty `git status --short` means there are no pending source changes.
Ignored local credentials and environment files will still exist on disk.

## 9. Create the GitHub repository

1. Sign in to [GitHub](https://github.com).
2. Choose **New repository**.
3. Name it `idx-lens` and select **Public** for the planned public source.
4. Leave **Add a README**, **Add .gitignore**, and the license selector empty
   for this first upload; this working folder already has its first two files.
5. Create the repository and copy its HTTPS URL.

Replace `YOUR_GITHUB_USERNAME` below with the actual account name:

```powershell
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/idx-lens.git
git push -u origin main
```

Use the normal Git credential/browser sign-in when prompted. Do not paste a
password or token into chat or embed one in the remote URL. If an `origin`
remote already exists, confirm it is the intended repository instead of
replacing it blindly.

## 10. Confirm Stage 1 is complete

On GitHub, confirm the README/source appear and the private files do not.
Open **Actions → Backend checks** and confirm both Windows and Linux jobs
pass. The workflow needs no repository secrets, Yahoo access, or MySQL server.

The setup kit includes this workflow; its first actual GitHub run happens
after your push. Local test success alone does not establish that hosted run.

Source publication completes this stage. Website hosting remains Stage 3,
after daily history, the model prototype, and UI integration. GitHub does not
run your MySQL database or local API simply because their source is uploaded.
Keep Pages disabled until the static frontend is ready.

For future source updates, the normal cycle is: edit → tests → `git add .` →
staged-file check → `git commit` → `git push`. Inspect the diff before each
commit. For screenshots, logs, or help in chat, omit passwords and tokens.

Official references:

- [Add existing code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [Ignore files](https://docs.github.com/en/get-started/git-basics/ignoring-files)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
