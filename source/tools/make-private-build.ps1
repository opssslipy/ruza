# Builds dist-private: the normal build, but portraits of people with photos are the cropped photos from refs-private\cropped.
# dist-private and refs-private are NEVER deployed (deploy.ps1 excludes them). Only for looking at the game locally.
# Usage: powershell -File tools\make-private-build.ps1   (run `npm run build` first)
$ErrorActionPreference = 'Stop'
$game = Split-Path -Parent $PSScriptRoot
$src = Join-Path $game 'dist'
$dst = Join-Path $game 'dist-private'
$crops = Join-Path $game 'refs-private\cropped'
if (-not (Test-Path $src)) { throw 'Run npm run build first' }
if (-not (Test-Path $crops)) { throw "No photos in $crops" }

robocopy $src $dst /MIR /NFL /NDL /NJH /NJS | Out-Null
Add-Type -AssemblyName System.Drawing
$jpeg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$ep = New-Object Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), ([int64]85)

foreach ($f in Get-ChildItem $crops -Filter *.png) {
  $id = $f.BaseName
  $b = [Drawing.Bitmap]::FromFile($f.FullName)
  $ms = New-Object IO.MemoryStream
  $b.Save($ms, $jpeg, $ep)
  $b64 = [Convert]::ToBase64String($ms.ToArray())
  $b.Dispose(); $ms.Dispose()
  $svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 240 240" width="240" height="240"><image width="240" height="240" xlink:href="data:image/jpeg;base64,' + $b64 + '"/></svg>'
  Set-Content (Join-Path $dst "portraits\$id.svg") $svg -Encoding utf8
  "$id <- photo"
}
