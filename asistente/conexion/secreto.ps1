param([string]$Escribir, [string]$Leer)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
if ($Escribir) {
  $valor = [Console]::In.ReadToEnd().Trim()
  if ([string]::IsNullOrWhiteSpace($valor)) { throw 'Valor vacio' }
  $seguro = ConvertTo-SecureString $valor -AsPlainText -Force
  [IO.File]::WriteAllText($Escribir, ($seguro | ConvertFrom-SecureString), $utf8)
  exit
}
if ($Leer) {
  $cifrado = (Get-Content -LiteralPath $Leer -Raw).Trim()
  $seguro = ConvertTo-SecureString $cifrado
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
