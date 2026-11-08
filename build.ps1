# NOTE:
#   Builds the standalone Graphlings folder and zip: Graphlings.exe, the page,
#   llama-server and the model. Testers only unzip and double-click.
#   Requires: PowerShell 7, uv (winget install astral-sh.uv), internet on the first run.
#
#   ./build.ps1                    # runtime + exe + zip  -> build/Graphlings-win-x64.zip
#   ./build.ps1 -Task Runtime      # only llama-server and the model, for 'uv run app/main.py'

#
#   Chapters:
#     DOWNLOAD RUNTIME   llama-server, the model and their licenses into runtime/.
#     BUILD APP          Packs Python and the app into Graphlings.exe.
#     PACKAGE ZIP        Puts exe, page, runtime and licenses into one zip.
#

param (
    <#
    [Optional]
    What to build. Runtime only downloads what the chat needs to run from source.
    #>
    [Parameter(
        Mandatory = $false
    )]
    [ValidateSet('All', 'Runtime')]
    [System.String]
    $Task = 'All',

    <#
    [Optional]
    Release tag of llama.cpp, pinned so every build uses the same server.
    #>
    [Parameter(
        Mandatory = $false
    )]
    [System.String]
    $LlamaCppTag = 'b11751',

    <#
    [Optional]
    The GGUF model file. Qwen2.5 1.5B Instruct, Q4_K_M quantised, about 1.1 GB.
    #>
    [Parameter(
        Mandatory = $false
    )]
    [System.String]
    $ModelUrl = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
)

Set-StrictMode -Version 1.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'     # the progress bar slows down big downloads a lot

$ROOT_DIR = $PSScriptRoot
$RUNTIME_DIR = Join-Path -Path $ROOT_DIR -ChildPath 'runtime'
$BUILD_DIR = Join-Path -Path $ROOT_DIR -ChildPath 'build'
$LICENSE_DIR = Join-Path -Path $RUNTIME_DIR -ChildPath 'licenses'
$PYTHON_VERSION = '3.12'
$PYINSTALLER_VERSION = 'pyinstaller>=6.10,<7'

# ===========================================================================
# ==========================   DOWNLOAD RUNTIME   ===========================
# ===========================================================================
#
#   1. Llama server   The CPU build of llama-server from the llama.cpp release.
#   2. Model          The GGUF model, downloaded to '.partial' and renamed when complete.
#   3. Licenses       License texts of llama.cpp and the model.
#
#   Everything that already exists is skipped, so a second run is fast.
#

# ---------------------------------------------------------------------------
# Llama server
#   The CPU build of llama-server from the llama.cpp release.
# ---------------------------------------------------------------------------

$LlamaDir = Join-Path -Path $RUNTIME_DIR -ChildPath 'llama'
$LlamaServer = Join-Path -Path $LlamaDir -ChildPath 'llama-server.exe'

if (-NOT (Test-Path -Path $LlamaServer)) {
    $zipName = "llama-$LlamaCppTag-bin-win-cpu-x64.zip"
    $zipFile = Join-Path -Path $BUILD_DIR -ChildPath $zipName
    $extractDir = Join-Path -Path $BUILD_DIR -ChildPath "llama-$LlamaCppTag"

    Write-Host "⬇️  llama.cpp $LlamaCppTag"
    $null = New-Item -ItemType Directory -Path $BUILD_DIR -Force
    Invoke-WebRequest -Uri "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaCppTag/$zipName" -OutFile $zipFile
    Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force

    # The exe and its DLLs sit in one folder of the zip, that folder becomes runtime/llama.
    $serverFile = Get-ChildItem -Path $extractDir -Filter 'llama-server.exe' -Recurse | Select-Object -First 1
    if ($null -EQ $serverFile) {
        throw [System.IO.FileNotFoundException]::new("No llama-server.exe in '$zipName'.")
    }
    $null = New-Item -ItemType Directory -Path $LlamaDir -Force
    Copy-Item -Path (Join-Path -Path $serverFile.DirectoryName -ChildPath '*') -Destination $LlamaDir -Recurse -Force
}

# ---------------------------------------------------------------------------
# Model
#   The GGUF model, downloaded to '.partial' and renamed when complete.
# ---------------------------------------------------------------------------

$ModelDir = Join-Path -Path $RUNTIME_DIR -ChildPath 'models'
$ModelFile = Join-Path -Path $ModelDir -ChildPath ([System.Uri]::new($ModelUrl).Segments[-1])

if (-NOT (Test-Path -Path $ModelFile)) {
    Write-Host "⬇️  $(Split-Path -Path $ModelFile -Leaf) (about 1.1 GB, takes a while)"
    $null = New-Item -ItemType Directory -Path $ModelDir -Force

    # A cancelled download never looks like a finished model.
    $partialFile = "$ModelFile.partial"
    Invoke-WebRequest -Uri $ModelUrl -OutFile $partialFile
    Move-Item -Path $partialFile -Destination $ModelFile -Force
}

# ---------------------------------------------------------------------------
# Licenses
#   License texts of llama.cpp and the model.
# ---------------------------------------------------------------------------

$null = New-Item -ItemType Directory -Path $LICENSE_DIR -Force
$LicenseSources = @{
    'llama.cpp.LICENSE.txt' = "https://raw.githubusercontent.com/ggml-org/llama.cpp/$LlamaCppTag/LICENSE"
    'qwen2.5.LICENSE.txt'   = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/LICENSE'
}
foreach ($entry in $LicenseSources.GetEnumerator()) {
    $licenseFile = Join-Path -Path $LICENSE_DIR -ChildPath $entry.Key
    if (Test-Path -Path $licenseFile) {
        continue
    }
    Invoke-WebRequest -Uri $entry.Value -OutFile $licenseFile
}

Write-Host "✅ Runtime ready in '$RUNTIME_DIR'."
if ($Task -EQ 'Runtime') {
    return
}

# ===========================================================================
# =============================   BUILD APP   ===============================
# ===========================================================================
#
#   1. Check uv     uv brings Python and the packages, nothing is installed globally.
#   2. Exe          PyInstaller packs app/ with Python and all packages.
#   3. Licenses     License texts of every packed Python package.
#
#   The generated code needs only the standard library. app/runner.py imports the
#   modules it uses, so PyInstaller packs them without extra flags.
#

# ---------------------------------------------------------------------------
# Check uv
#   uv brings Python and the packages, nothing is installed globally.
# ---------------------------------------------------------------------------

if ($null -EQ (Get-Command -Name 'uv' -ErrorAction SilentlyContinue)) {
    throw [System.InvalidOperationException]::new('uv is missing. Install it with: winget install astral-sh.uv')
}

$UvRun = @(
    'run', '--no-project', '--python', $PYTHON_VERSION,
    '--with-requirements', (Join-Path -Path $ROOT_DIR -ChildPath 'app/requirements.txt'),
    '--with', $PYINSTALLER_VERSION,
    '--with', 'pip-licenses'
)

# ---------------------------------------------------------------------------
# Exe
#   PyInstaller packs app/ with Python and all packages.
# ---------------------------------------------------------------------------

Write-Host '📦 Graphlings.exe'
$PyInstallerArgs = @(
    (Join-Path -Path $ROOT_DIR -ChildPath 'app/main.py'),
    '--name', 'Graphlings',
    '--onedir', '--windowed', '--noconfirm', '--clean',
    '--distpath', (Join-Path -Path $BUILD_DIR -ChildPath 'dist'),
    '--workpath', (Join-Path -Path $BUILD_DIR -ChildPath 'work'),
    '--specpath', $BUILD_DIR,
    '--paths', (Join-Path -Path $ROOT_DIR -ChildPath 'app')
)
& uv @UvRun -- pyinstaller @PyInstallerArgs
if ($LASTEXITCODE -NE 0) {
    throw [System.InvalidOperationException]::new("PyInstaller failed with exit code $LASTEXITCODE.")
}

# ---------------------------------------------------------------------------
# Licenses
#   License texts of every packed Python package.
# ---------------------------------------------------------------------------

$PythonLicenseFile = Join-Path -Path $BUILD_DIR -ChildPath 'python-packages.LICENSES.txt'
& uv @UvRun -- pip-licenses --with-license-file --no-license-path --format=plain-vertical --output-file $PythonLicenseFile
if ($LASTEXITCODE -NE 0) {
    throw [System.InvalidOperationException]::new("pip-licenses failed with exit code $LASTEXITCODE.")
}

# ===========================================================================
# ============================   PACKAGE ZIP   ==============================
# ===========================================================================
#
#   1. Assemble   Copies page, runtime and licenses next to the exe.
#   2. Zip        Packs the folder, tar is much faster than Compress-Archive.
#

# ---------------------------------------------------------------------------
# Assemble
#   Copies page, runtime and licenses next to the exe.
# ---------------------------------------------------------------------------

$AppDir = Join-Path -Path $BUILD_DIR -ChildPath 'dist/Graphlings'
$AppLicenseDir = Join-Path -Path $AppDir -ChildPath 'licenses'

Copy-Item -Path (Join-Path -Path $ROOT_DIR -ChildPath 'web') -Destination $AppDir -Recurse -Force
$null = New-Item -ItemType Directory -Path (Join-Path -Path $AppDir -ChildPath 'runtime') -Force
Copy-Item -Path $LlamaDir -Destination (Join-Path -Path $AppDir -ChildPath 'runtime') -Recurse -Force
Copy-Item -Path $ModelDir -Destination (Join-Path -Path $AppDir -ChildPath 'runtime') -Recurse -Force

$null = New-Item -ItemType Directory -Path $AppLicenseDir -Force
Copy-Item -Path (Join-Path -Path $LICENSE_DIR -ChildPath '*') -Destination $AppLicenseDir -Force
Copy-Item -Path $PythonLicenseFile -Destination $AppLicenseDir -Force
Copy-Item -Path (Join-Path -Path $ROOT_DIR -ChildPath 'THIRD_PARTY_LICENSES.md') -Destination $AppDir -Force

# ---------------------------------------------------------------------------
# Zip
#   Packs the folder, tar is much faster than Compress-Archive.
# ---------------------------------------------------------------------------

$ZipFile = Join-Path -Path $BUILD_DIR -ChildPath 'Graphlings-win-x64.zip'
Remove-Item -Path $ZipFile -Force -ErrorAction SilentlyContinue
& tar.exe -a -c -f $ZipFile -C (Join-Path -Path $BUILD_DIR -ChildPath 'dist') 'Graphlings'
if ($LASTEXITCODE -NE 0) {
    throw [System.InvalidOperationException]::new("tar failed with exit code $LASTEXITCODE.")
}

$SizeMb = [System.Math]::Round((Get-Item -Path $ZipFile).Length / 1MB)
Write-Host "✅ $ZipFile ($SizeMb MB)"
