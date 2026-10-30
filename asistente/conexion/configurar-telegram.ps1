$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
Write-Host 'Este paso guarda el token de TU bot de Telegram (cifrado para este usuario de Windows). Despues se vincula tu cuenta con un codigo.'
Write-Host 'No pegues el token en ningun chat. Si el bot ya tiene un webhook activo, el puente se negara a arrancar.'
$token = Read-Host 'Token del bot (oculto)' -AsSecureString
if ($token.Length -eq 0) { throw 'Token vacio' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $dir 'telegram.dpapi'), ($token | ConvertFrom-SecureString), $utf8)
Write-Host 'Token guardado.'
