param([switch]$Read)
$ErrorActionPreference = 'Stop'
$homeDir = Split-Path $PSScriptRoot -Parent
$file = Join-Path $homeDir 'openrouter.dpapi'
if ($Read) {
  $encrypted = (Get-Content -LiteralPath $file -Raw).Trim()
  $secret = ConvertTo-SecureString $encrypted
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  exit
}
Write-Host 'Cada persona usa su propia cuenta OpenRouter. No hay clave ni saldo incluidos.'
Write-Host 'En OpenRouter crea una clave dedicada, con tu limite de gasto e inclusion BYOK.'
Write-Host 'La cuenta puede cobrar segun el modelo. No hay cambio automatico a otro proveedor.'
Write-Host 'Conversaciones y notas enviadas al modelo salen de tu PC; revisa la privacidad del proveedor.'
$model = Read-Host 'Modelo OpenRouter (Enter: openai/gpt-4.1-mini)'
if ([string]::IsNullOrWhiteSpace($model)) { $model = 'openai/gpt-4.1-mini' }
if ($model -notmatch '^[a-z0-9_.-]+/[a-zA-Z0-9_./:-]+$') { throw 'Modelo no valido' }
$answer = Read-Host 'Entiendo el posible costo y he configurado mi limite en OpenRouter. Escribe SI'
if ($answer -cne 'SI') { throw 'Sin cambios' }
$secret = Read-Host 'Pega tu clave propia (oculta)' -AsSecureString
if ($secret.Length -eq 0) { throw 'Clave vacia' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($file, ($secret | ConvertFrom-SecureString), $utf8)
[IO.File]::WriteAllText((Join-Path $homeDir 'settings.json'), (@{model=$model} | ConvertTo-Json), $utf8)
Write-Host 'Configuracion guardada para este usuario Windows. El arranque verificara el limite sin llamar al modelo.'
