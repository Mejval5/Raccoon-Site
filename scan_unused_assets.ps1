# Set the paths for the assets and source directories
$assetsPath = (Resolve-Path ".\src\assets").Path
$sourcePath = (Resolve-Path ".\src").Path

# Get all image files from the assets directory and its subdirectories
$assets = Get-ChildItem -Recurse -Path $assetsPath -Include *.png, *.jpg, *.jpeg, *.gif, *.svg | Select-Object -ExpandProperty FullName

# Prepare a list to store unused assets
$unusedAssets = @()

# Get all source files that could reference the assets (.vue, .js, .ts, .html)
$sourceFiles = Get-ChildItem -Recurse -Path $sourcePath -Include *.vue, *.js, *.ts, *.html

# Loop through each asset and check if it is referenced in any source file
foreach ($asset in $assets) {
    # Convert the asset path to a relative format for the reference, e.g., "@/assets/milan/20.jpg"
    $relativePath = $asset.Substring($assetsPath.Length).Replace("\", "/").TrimStart("/")
    $referencePattern = "assets/$relativePath"
    #Write-Host $referencePattern

    # Flag to track if the asset is referenced
    $isReferenced = $false

    # Loop through each source file and check if the asset is referenced
    foreach ($file in $sourceFiles) {
        $fileContent = Get-Content -Path $file.FullName -Raw
        if ($fileContent -match [regex]::Escape($referencePattern)) {
            $isReferenced = $true
            break
        }
    }

    # If the asset is not referenced, add it to the unused assets list
    if (-not $isReferenced) {
        $unusedAssets += $asset
    }
}

# Output the list of unused assets
if ($unusedAssets.Count -eq 0) {
    Write-Host "No unused assets found."
} else {
    Write-Host "Unused assets:"
    $unusedAssets | ForEach-Object { Write-Host $_ }
}

# Define the path for the assets_unused folder
$unusedAssetsFolder = Join-Path "./assets_unused"

# Create the assets_unused folder if it doesn't exist
if (-not (Test-Path $unusedAssetsFolder)) {
    New-Item -ItemType Directory -Path $unusedAssetsFolder | Out-Null
}

# Move all unused assets to the assets_unused folder
foreach ($unusedAsset in $unusedAssets) {
    $destinationPath = Join-Path $unusedAssetsFolder ([System.IO.Path]::GetFileName($unusedAsset))
    Move-Item -Path $unusedAsset -Destination $destinationPath
}

Write-Host "All unused assets have been moved to $unusedAssetsFolder."
