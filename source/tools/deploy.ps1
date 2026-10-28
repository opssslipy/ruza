# Builds the game, copies the build to the root of the GitHub repo clone and the sources to source/, then commits and pushes.
# Usage: powershell -File tools\deploy.ps1 -Message "what changed"
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = 'Stop'
$env:Path = 'C:\Program Files\Git\cmd;C:\Program Files\GitHub CLI;' + $env:Path
$git = 'C:\Program Files\Git\cmd\git.exe'
$game = Split-Path -Parent $PSScriptRoot
$repo = Join-Path (Split-Path -Parent $game) 'repo'

if (-not (Test-Path (Join-Path $repo '.git'))) { throw "No clone at $repo. Run: gh repo clone opssslipy/ruza $repo" }

Push-Location $game
npm run build | Out-Host
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'build failed, nothing deployed' }
Pop-Location

& $git -C $repo pull --ff-only | Out-Host

# deployed game = site root (what GitHub Pages serves)
foreach ($d in 'assets', 'portraits') { robocopy (Join-Path $game "dist\$d") (Join-Path $repo $d) /MIR /NFL /NDL /NJH /NJS | Out-Null }
Copy-Item (Join-Path $game 'dist\index.html') (Join-Path $repo 'index.html') -Force
# map.json is loaded at runtime from the site root
Copy-Item (Join-Path $game 'dist\map.json') (Join-Path $repo 'map.json') -Force

# sources, without secrets and without photos of real people
robocopy $game (Join-Path $repo 'source') /MIR /XD node_modules dist dist-private refs-private .git /XF .env *.log /NFL /NDL /NJH /NJS | Out-Null

# safety net: no raster photos anywhere in what is about to be published
$photos = Get-ChildItem $repo -Recurse -File -Include *.png, *.jpg, *.jpeg, *.webp, *.heic -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\.git\\' }
if ($photos) { throw "Refusing to push, raster images found: $($photos.FullName -join ', ')" }
if (Get-ChildItem $repo -Recurse -Directory -Filter refs-private -ErrorAction SilentlyContinue) { throw 'Refusing to push: refs-private found' }

& $git -C $repo add -A
$pending = & $git -C $repo status --porcelain
if (-not $pending) { 'Nothing to commit.'; return }
& $git -C $repo commit -m $Message | Out-Host
& $git -C $repo push | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'PUSH FAILED: the commit exists only locally in the repo clone. Check the GitHub token permissions.' }
'Pushed. Site: https://opssslipy.github.io/ruza/ (Pages needs 1-2 minutes to rebuild)'
