$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'Conectar a conta Melhor Envio ao projeto LV Maker'
Write-Host 'Gere o token em Integrações > Permissões de Acesso no Melhor Envio.'
Write-Host 'Informe o token somente no campo protegido abaixo.'
Write-Host 'Não envie esse código no chat. Este procedimento não publica o sistema.'
$firebaseComando = Get-Command firebase -ErrorAction Stop
$firebaseScript = Join-Path (Split-Path -Parent $firebaseComando.Source) 'node_modules/firebase-tools/lib/bin/firebase.js'
if (!(Test-Path -LiteralPath $firebaseScript)) { throw 'Não foi encontrada a instalação local do Firebase CLI.' }
$credencialEnvio = Read-Host 'Token do Melhor Envio' -AsSecureString
$ponteiroEnvio = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credencialEnvio)
try {
    $valorEnvio = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroEnvio).Trim()
    if ($valorEnvio.Length -lt 40 -or $valorEnvio -match '\s') { throw 'Confira o token copiado no Melhor Envio.' }
    $processoEnvio = [Diagnostics.ProcessStartInfo]::new()
    $processoEnvio.FileName = (Get-Command node -ErrorAction Stop).Source
    $processoEnvio.UseShellExecute = $false
    $processoEnvio.RedirectStandardInput = $true
    foreach ($argumentoEnvio in @($firebaseScript, 'functions:secrets:set', 'MELHOR_ENVIO_TOKEN', '--project', 'lv-maker', '--data-file', '-', '--non-interactive')) { $processoEnvio.ArgumentList.Add($argumentoEnvio) }
    $execucaoEnvio = [Diagnostics.Process]::Start($processoEnvio)
    $execucaoEnvio.StandardInput.Write($valorEnvio)
    $execucaoEnvio.StandardInput.Close()
    $execucaoEnvio.WaitForExit()
    if ($execucaoEnvio.ExitCode -ne 0) { throw 'O Firebase não confirmou o cadastro da credencial. Confira o acesso ao projeto e tente novamente.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroEnvio)
    $valorEnvio = $null
    $credencialEnvio.Dispose()
}
Write-Host 'Credencial cadastrada. A conexão precisa ser publicada e testada antes da ativação.'
