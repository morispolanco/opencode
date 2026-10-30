@echo off
chcp 65001 >nul
setlocal
set "TMPPS=%TEMP%\instalar-gracian-%RANDOM%.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); $m=[regex]::Match($s,'(?ms)^::PS1-BEGIN\r?\n(.*?)^::PS1-END'); if(-not $m.Success){[Console]::Error.WriteLine('Archivo danado'); exit 1}; [IO.File]::WriteAllText($env:TMPPS, $m.Groups[1].Value, (New-Object Text.UTF8Encoding $true))"
if errorlevel 1 (echo No se pudo preparar el instalador. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%"
set "CODIGO=%ERRORLEVEL%"
del /q "%TMPPS%" >nul 2>nul
pause
exit /b %CODIGO%
::PS1-BEGIN
#Requires -Version 5.1
# Instalador de un solo paso: Asistente con memoria + comando gracian (0.7.0)
# - Descarga el codigo publicado (huella verificada), instala el motor (commit fijado) y sus dependencias.
# - Deja el comando gracian registrado en el PATH del usuario (se comprueba releyendo el registro).
# - No incluye ni pide claves aqui: la clave propia de OpenRouter se configura despues con Configurar.cmd (DPAPI).
# - Idempotente: si ya esta instalado no toca nada; si un intento anterior quedo a medias, lo limpia y reintenta.
# - Si algo falla a mitad, deshace lo hecho (carpeta creada y entrada de PATH agregada).
$ErrorActionPreference = 'Stop'
$Version   = '0.7.0'
$ZipUrl    = 'https://github.com/morispolanco/opencode/releases/download/v0.7.0/asistente-0.7.0.zip'
$ZipSha    = '93885e94c082fa86fcff9ab15a9cd02c9c804053db1311ac61f72a90bf5dc177'
$BunVer    = '1.4.4'
$BunUrl    = 'https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-windows-x64.zip'
$Commit    = 'db768f5990cb54845efff5806a7197fc1bb45e9b'

$EsPrueba = $env:GRACIAN_PRUEBA -eq '1'
if ($EsPrueba) {
  if ($env:GRACIAN_ZIP_URL) { $ZipUrl = $env:GRACIAN_ZIP_URL }
  if ($env:GRACIAN_ZIP_SHA) { $ZipSha = $env:GRACIAN_ZIP_SHA }
  if ($env:GRACIAN_DESTINO) { $Destino = $env:GRACIAN_DESTINO } else { $Destino = Join-Path $HOME 'Asistente con memoria' }
  $PathScope = 'Process'
} else {
  $Destino = Join-Path $env:USERPROFILE 'Asistente con memoria'
  $PathScope = 'User'
}
$Marcador = "$Destino.instalando-gracian"
$Tmp = Join-Path ([IO.Path]::GetTempPath()) ('gracian-inst-' + [Guid]::NewGuid().ToString('N'))
$pathAgregado = $false
$bunPath = $null
$destinoPropio = $false

function Info($m) { Write-Host $m }

function TieneBin([string]$valor, [string]$bin) {
  if (-not $valor) { return $false }
  foreach ($i in ($valor -split ';')) {
    if ($i.Trim().TrimEnd('\').ToLower() -eq $bin.TrimEnd('\').ToLower()) { return $true }
  }
  return $false
}

function Agregar-Path([string]$bin) {
  $actual = [Environment]::GetEnvironmentVariable('Path', $script:PathScope)
  if (TieneBin $actual $bin) { return $false }
  $items = @()
  if ($actual) { $items = @($actual -split ';' | Where-Object { $_.Trim() -ne '' }) }
  [Environment]::SetEnvironmentVariable('Path', (($items + $bin) -join ';'), $script:PathScope)
  if (-not (TieneBin ([Environment]::GetEnvironmentVariable('Path', $script:PathScope)) $bin)) { throw 'La escritura del PATH no se reflejo al releer el registro' }
  return $true
}

function Quitar-Path([string]$bin) {
  $actual = [Environment]::GetEnvironmentVariable('Path', $script:PathScope)
  $items = @(); if ($actual) { $items = @($actual -split ';' | Where-Object { $_.Trim() -ne '' }) }
  $queda = @($items | Where-Object { $_.Trim().TrimEnd('\').ToLower() -ne $bin.TrimEnd('\').ToLower() })
  [Environment]::SetEnvironmentVariable('Path', ($queda -join ';'), $script:PathScope)
  if (TieneBin ([Environment]::GetEnvironmentVariable('Path', $script:PathScope)) $bin) { throw 'La quita del PATH no se reflejo al releer el registro' }
}

function Descargar([string]$url, [string]$dest) {
  if ($url -like 'file://*') { Copy-Item ($url.Substring(7)) $dest -Force; return }
  $curlApp = Get-Command curl -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
  if ($curlApp) {
    & $curlApp.Source -fsSL -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar: $url" }
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  }
}

function Asegurar-Bun {
  $bun = Get-Command bun -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
  if ($bun) {
    $v = (& $bun.Source --version 2>$null)
    if (($v | Select-Object -Last 1) -eq $script:BunVer) { Info "Bun $script:BunVer encontrado."; return }
    Info "Hay otro Bun en PATH; se instalara la version $script:BunVer aparte (solo para este usuario)."
  }
  if ($script:EsPrueba) { throw "PRUEBA: se esperaba Bun $script:BunVer en PATH" }
  $dirBun = Join-Path $env:USERPROFILE '.bun'
  $destBin = Join-Path $dirBun 'bin'
  $zip = Join-Path $env:TEMP 'bun-windows-x64.zip'
  Info "Descargando Bun $script:BunVer (origen oficial: github.com/oven-sh/bun)..."
  Descargar $script:BunUrl $zip
  $tmpBun = Join-Path $env:TEMP ('bunx-' + [Guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $zip -DestinationPath $tmpBun -Force
  $exe = Join-Path (Join-Path $tmpBun 'bun-windows-x64') 'bun.exe'
  if (-not (Test-Path $exe)) { throw 'El paquete de Bun no trajo bun.exe' }
  New-Item -ItemType Directory -Force $destBin | Out-Null
  Copy-Item $exe (Join-Path $destBin 'bun.exe') -Force
  Remove-Item -Recurse -Force $tmpBun
  $env:Path = "$destBin;$env:Path"
  $v = (& bun --version 2>$null)
  if (($v | Select-Object -Last 1) -ne $script:BunVer) { throw 'Bun no quedo disponible tras instalarlo' }
  if (Agregar-Path $destBin) { $script:bunPath = $destBin }
  Info "Bun $script:BunVer instalado en $destBin (solo este usuario)."
}

function Asegurar-Git {
  $git = Get-Command git -ErrorAction SilentlyContinue | Where-Object { $_.CommandType -eq 'Application' } | Select-Object -First 1
  if ($git) { Info (& git --version); return }
  if ($script:EsPrueba) { throw 'PRUEBA: se esperaba git en PATH' }
  Info 'Git no esta instalado; se intentara instalar con winget (paquete oficial Git.Git).'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Falta Git y no se encontro winget. Instala Git desde https://git-scm.com/downloads y vuelve a abrir este instalador.' }
  & winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget no pudo instalar Git (codigo $LASTEXITCODE). Instala Git desde https://git-scm.com/downloads y reintenta." }
  $gitCmd = 'C:\Program Files\Git\cmd'
  if (Test-Path $gitCmd) { $env:Path = "$gitCmd;$env:Path" }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git se instalo pero no aparece en esta sesion. Cierra esta ventana y vuelve a abrir el instalador.' }
  Info (& git --version)
}

function Copiar-SoloNuevos([string]$origen, [string]$dst) {
  $copiados = 0
  foreach ($f in (Get-ChildItem -Recurse -File $origen)) {
    $rel = $f.FullName.Substring($origen.Length).TrimStart('\','/')
    $dest = Join-Path $dst $rel
    if (Test-Path $dest) {
      $h1 = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash
      $h2 = (Get-FileHash -Algorithm SHA256 $dest).Hash
      if ($h1 -ne $h2) { throw "Ya existe $dest con otro contenido; no se sobrescribe nada." }
    } else {
      New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
      Copy-Item $f.FullName $dest
      $copiados++
    }
  }
  foreach ($f in (Get-ChildItem -Recurse -File $origen)) {
    $rel = $f.FullName.Substring($origen.Length).TrimStart('\','/')
    $h1 = (Get-FileHash -Algorithm SHA256 $f.FullName).Hash
    $h2 = (Get-FileHash -Algorithm SHA256 (Join-Path $dst $rel)).Hash
    if ($h1 -ne $h2) { throw "No se copio bien: $rel" }
  }
  return $copiados
}

try {
  Info '=============================================='
  Info ' Asistente con memoria + comando gracian (0.7.0)'
  Info '=============================================='
  Info ''
  Info 'Esto instalara, solo para tu usuario de Windows:'
  Info "  1. El asistente en: $Destino"
  Info '  2. El comando gracian en el PATH de tu usuario.'
  Info 'Si falta Bun 1.4.4 o Git, se instalan desde sus sitios oficiales.'
  Info 'No se incluye ninguna clave: la tuya la pedira Configurar.cmd al final.'
  Info ''
  if (-not $EsPrueba) {
    if ($env:OS -ne 'Windows_NT') { throw 'Este instalador es para Windows 11 de 64 bits.' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Se necesita Windows de 64 bits.' }
    Read-Host 'Pulsa Enter para empezar (o cierra la ventana para cancelar)' | Out-Null
  }

  # Carpeta destino: ya instalada, intento incompleto de este instalador, o ajena
  if (Test-Path $Destino) {
    if (Test-Path (Join-Path $Destino 'installation.json')) {
      $binDir = Join-Path $Destino 'bin'
      if ((Test-Path $binDir) -and (Agregar-Path $binDir)) { Info 'Se agrego la carpeta bin al PATH de tu usuario.' }
      if (Test-Path $Marcador) { Remove-Item $Marcador -Force }
      Info "Ya estaba instalado en $Destino. No se cambio ningun archivo, clave, memoria ni conversacion."
      exit 0
    }
    if (Test-Path $Marcador) {
      Info 'Hay un intento anterior de este instalador que no termino; se limpia y se reintenta.'
      Remove-Item -Recurse -Force $Destino
      Remove-Item -Force $Marcador
    } else {
      throw "La carpeta $Destino ya existe y no es de este instalador. No se toco nada."
    }
  }

  Asegurar-Bun
  Asegurar-Git

  [IO.File]::WriteAllText($Marcador, (Get-Date).ToString('s'))
  $destinoPropio = $true  # desde aqui, si $Destino aparece lo creo ESTA ejecucion
  New-Item -ItemType Directory -Force $Tmp | Out-Null
  $zipLocal = Join-Path $Tmp 'asistente.zip'
  Info 'Descargando el paquete del asistente (repositorio publico, version fijada)...'
  Descargar $ZipUrl $zipLocal
  if ($ZipSha) {
    $h = (Get-FileHash -Algorithm SHA256 $zipLocal).Hash.ToLower()
    if ($h -ne $ZipSha.ToLower()) { throw 'El paquete descargado no coincide con su huella esperada; descarga danada o alterada.' }
    Info 'Huella del paquete verificada.'
  }
  Expand-Archive -LiteralPath $zipLocal -DestinationPath $Tmp -Force
  $paq = Join-Path $Tmp 'asistente'
  if (-not (Test-Path (Join-Path $paq 'launcher\install.mjs'))) { throw 'El paquete no tiene la estructura esperada.' }

  Info 'Descargando el motor (commit fijado) e instalando dependencias. Puede tardar varios minutos...'
  & bun (Join-Path $paq 'launcher\install.mjs') $Destino
  if ($LASTEXITCODE -ne 0) { throw 'El instalador del motor informo un error (mensaje arriba).' }
  if (-not (Test-Path (Join-Path $Destino 'installation.json'))) { throw 'El motor no quedo instalado (falta installation.json).' }

  Info 'Copiando la conexion y el comando gracian...'
  $n1 = Copiar-SoloNuevos (Join-Path $paq 'conexion') (Join-Path $Destino 'conexion')
  $n2 = Copiar-SoloNuevos (Join-Path $paq 'bin') (Join-Path $Destino 'bin')
  Info "Archivos del asistente copiados: $($n1 + $n2) (los que ya existian identicos se dejaron)."

  $binFinal = Join-Path $Destino 'bin'
  if (Agregar-Path $binFinal) { $pathAgregado = $true; Info 'Comando registrado en el PATH de tu usuario (comprobado releyendo el registro).' }

  Info 'Comprobando la instalacion...'
  $head = (& git -C (Join-Path $Destino 'source') rev-parse HEAD 2>$null)
  if (($head | Select-Object -Last 1) -ne $Commit) { throw 'El codigo del motor no esta en el commit esperado.' }
  $meta = Get-Content -Raw (Join-Path $Destino 'installation.json') | ConvertFrom-Json
  if ($meta.commit -ne $Commit) { throw 'installation.json no coincide con la version esperada.' }
  $cli = & bun (Join-Path $Destino 'conexion\gracian-cli.mjs') aforismo 1 2>&1
  if ($LASTEXITCODE -ne 0 -or -not ("$cli" -match 'Aforismo 1')) { throw "La consulta local de la biblioteca no funciona: $cli" }
  $cnt = & bun -e "const u=new URL('file:///'+process.argv[1].replace(/\\/g,'/'));const m=await import(u);const d=m.cargar();if(d.aforismos.length!==300)throw new Error('cuenta');console.log('300')" (Join-Path $Destino 'conexion\biblioteca.mjs') 2>$null
  if (($cnt | Select-Object -Last 1) -ne '300') { throw 'La biblioteca de Gracian no tiene sus 300 aforismos.' }
  if (-not (Test-Path (Join-Path $binFinal 'gracian.cmd'))) { throw 'Falta bin\gracian.cmd' }
  Info 'Comprobaciones superadas: motor, biblioteca (300 aforismos), comando y PATH.'

  Remove-Item $Marcador -Force
  Remove-Item -Recurse -Force $Tmp
  Info ''
  Info 'LISTO. Queda un paso tuyo, una sola vez:'
  Info "  1. Abre $Destino\Configurar.cmd y pega TU PROPIA clave de OpenRouter (se guarda cifrada para tu usuario; no viaja por chat)."
  Info '     En OpenRouter ponle a esa clave un limite de gasto finito con BYOK incluido; el arranque lo comprueba.'
  Info '  2. Cierra las terminales abiertas. Para conversar: Abrir.cmd, o escribe gracian en una terminal nueva.'
  Info '  3. Telegram (opcional, despues): conexion\Telegram.cmd.'
  exit 0
} catch {
  Write-Host ''
  Write-Host ("ERROR: " + $_.Exception.Message)
  if ($destinoPropio -or $pathAgregado) {
    Write-Host 'Deshaciendo lo hecho por este instalador...'
    try { if ($pathAgregado) { Quitar-Path (Join-Path $Destino 'bin') } } catch { Write-Host ('Aviso al deshacer el PATH: ' + $_.Exception.Message) }
    try { if (Test-Path $Marcador) { Remove-Item $Marcador -Force } } catch {}
    try {
      if ($destinoPropio -and (Test-Path $Destino)) { Remove-Item -Recurse -Force $Destino; Write-Host 'No quedo ningun cambio del asistente.' }
    } catch { Write-Host "No se pudo borrar $Destino por completo; revisa esa carpeta." }
    if ($bunPath) { Write-Host "Bun 1.4.4 quedo instalado en $bunPath (sirve para reintentar)." }
  }
  exit 1
}
::PS1-END
