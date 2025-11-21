param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev","prod")]
    [string]$env
)

# CONFIG
$devUrl  = "https://gtixdparpjdpyhhubsfz.supabase.co"
$devKey  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0aXhkcGFycGpkcHloaHVic2Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDUxNDksImV4cCI6MjA3ODk4MTE0OX0.jQdd18hGPESpDi7IvXWBZK0_bDy4-DKoSGHtZZpxAP0"

$prodUrl = "https://splcucorowqjxeeseolq.supabase.co"
$prodKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbGN1Y29yb3dxanhlZXNlb2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTExMjUsImV4cCI6MjA3ODYyNzEyNX0.R-Fm04UtBOr9OBWHnS1fhk6SnfSm7f3ZrFrQdzO1Q4Y"

$targetUrl = if ($env -eq "dev") { $devUrl } else { $prodUrl }
$targetKey = if ($env -eq "dev") { $devKey } else { $prodKey }

# Backup folder
$stamp = (Get-Date -Format "yyyyMMdd-HHmmss")
$backup = "supa_backup_$stamp"
New-Item -ItemType Directory -Name $backup | Out-Null

# Logging
$log = "supa_switch_$stamp.log"
"[$(Get-Date)] Switching to $env" | Out-File $log

# Process files
try {
    Get-ChildItem -Recurse -Include *.html,*.js |
        Where-Object { $_.FullName -notmatch "supa_backup_" } |      # <<< EXCLUDE BACKUPS
        ForEach-Object {

            $orig = Get-Content $_.FullName -Raw

            Copy-Item $_.FullName "$backup\$($_.Name)"

            $new = $orig `
                -replace "https://[A-Za-z0-9\-]+\.supabase\.co", $targetUrl `
                -replace "eyJhbGci[A-Za-z0-9_\-\.]+", $targetKey

            if ($new -ne $orig) {
                Set-Content $_.FullName $new
                "[$(Get-Date)] Updated $($_.FullName)" | Out-File $log -Append
            }
        }

    exit 0
}
catch {
    "[$(Get-Date)] ERROR: $_" | Out-File $log -Append
    exit 1
}
