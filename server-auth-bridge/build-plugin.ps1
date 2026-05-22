$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root
$buildDir = Join-Path $root 'build'
$classesDir = Join-Path $buildDir 'classes'
$libDir = Join-Path $root 'lib'
$sourcesFile = Join-Path $buildDir 'sources.txt'
$pluginJar = Join-Path $buildDir 'ForgeWorldAuthBridge.jar'
$authMeJar = Join-Path $projectRoot 'aditional\AuthMe-6.0.0-Spigot-Legacy.jar'
$serverApiJar = Join-Path $libDir 'paper-api-1.21.1-R0.1-SNAPSHOT.jar'
$serverApiUrl = 'https://repo.papermc.io/repository/maven-public/io/papermc/paper/paper-api/1.21.1-R0.1-SNAPSHOT/paper-api-1.21.1-R0.1-20250328.161643-128.jar'
$adventureApiJar = Join-Path $libDir 'adventure-api-4.17.0.jar'
$adventureApiUrl = 'https://repo.maven.apache.org/maven2/net/kyori/adventure-api/4.17.0/adventure-api-4.17.0.jar'

if (-not (Test-Path -LiteralPath $authMeJar)) {
  throw "AuthMe jar not found: $authMeJar"
}

New-Item -ItemType Directory -Force -Path $buildDir, $classesDir, $libDir | Out-Null

if (-not (Test-Path -LiteralPath $serverApiJar)) {
  Write-Host "Downloading Paper API for compilation..."
  curl.exe -L --retry 3 --connect-timeout 30 --max-time 180 -o $serverApiJar $serverApiUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to download Paper API. curl exit code: $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $adventureApiJar)) {
  Write-Host "Downloading Adventure API for compilation..."
  curl.exe -L --retry 3 --connect-timeout 30 --max-time 120 -o $adventureApiJar $adventureApiUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to download Adventure API. curl exit code: $LASTEXITCODE"
  }
}

Remove-Item -LiteralPath $classesDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $classesDir | Out-Null

$sources = Get-ChildItem -LiteralPath (Join-Path $root 'src\main\java') -Filter *.java -Recurse |
  ForEach-Object { '"' + ($_.FullName -replace '\\', '/') + '"' }
[System.IO.File]::WriteAllLines($sourcesFile, $sources, [System.Text.UTF8Encoding]::new($false))

$classpath = "$serverApiJar;$adventureApiJar;$authMeJar"
javac -encoding UTF-8 -source 17 -target 17 -classpath $classpath -d $classesDir "@$sourcesFile"
if ($LASTEXITCODE -ne 0) {
  throw "javac failed with exit code $LASTEXITCODE"
}
Copy-Item -Path (Join-Path $root 'src\main\resources\*') -Destination $classesDir -Recurse -Force
jar --create --file $pluginJar -C $classesDir .
if ($LASTEXITCODE -ne 0) {
  throw "jar failed with exit code $LASTEXITCODE"
}

Write-Host "Built: $pluginJar"
