git log --oneline --decorate --graph -20
$hash = Read-Host "Enter commit hash to roll back to (0 to exit)"

if ($hash -eq "0") {
    Write-Host "Cancelled."
    exit
}

$branch = "rollback-$((Get-Date).ToString('yyyyMMdd-HHmm'))"
git switch -c $branch $hash
Write-Host "Now on rollback branch: $branch"
