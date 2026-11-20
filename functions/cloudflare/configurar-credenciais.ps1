param([switch]$SomenteFirebase)
$ErrorActionPreference = 'Stop'
$raizIntegracao = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $raizIntegracao
$configIntegracao = Join-Path $PSScriptRoot 'wrangler.json'
$parametrosIntegracao = [IO.File]::ReadAllText($configIntegracao) | ConvertFrom-Json
if ($parametrosIntegracao.account_id -notmatch '^[a-f0-9]{32}$') { throw 'Conecte a conta e confira o identificador do Cloudflare na configuração antes de cadastrar credenciais.' }
$comandoNpx = Get-Command npx -ErrorAction Stop
$scriptNpx = Join-Path (Split-Path -Parent $comandoNpx.Source) 'node_modules/npm/bin/npx-cli.js'
if (!(Test-Path -LiteralPath $scriptNpx)) { throw 'Instalação do npm não encontrada.' }
function EnviarSegredoIntegracao($nomeIntegracao, $valorIntegracao) {
    $inicioIntegracao = [Diagnostics.ProcessStartInfo]::new()
    $inicioIntegracao.FileName = (Get-Command node -ErrorAction Stop).Source
    $inicioIntegracao.UseShellExecute = $false
    $inicioIntegracao.RedirectStandardInput = $true
    foreach ($argIntegracao in @($scriptNpx, '--yes', 'wrangler@4.148.0', 'secret', 'put', $nomeIntegracao, '--config', $configIntegracao)) { $inicioIntegracao.ArgumentList.Add($argIntegracao) }
    $processoIntegracao = [Diagnostics.Process]::Start($inicioIntegracao)
    $processoIntegracao.StandardInput.Write($valorIntegracao)
    $processoIntegracao.StandardInput.Close()
    $processoIntegracao.WaitForExit()
    if ($processoIntegracao.ExitCode -ne 0) { throw "O Cloudflare não confirmou o cadastro de $nomeIntegracao. Confira o login e tente novamente." }
}
Write-Host 'Cadastro protegido das credenciais no Cloudflare. Não envie os valores no chat.'
Write-Host 'Faça login no Cloudflare antes de continuar. Use uma conta de serviço exclusiva do Firebase, com o papel Cloud Datastore User.'
$arquivoIntegracao = Read-Host 'Caminho completo do JSON da conta de serviço, guardado fora da pasta do sistema'
$arquivoIntegracao = (Resolve-Path -LiteralPath $arquivoIntegracao).Path
if ($arquivoIntegracao.StartsWith($raizIntegracao + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Guarde a credencial fora da pasta do sistema antes de continuar.' }
try {
    $jsonIntegracao = [IO.File]::ReadAllText($arquivoIntegracao)
    $contaIntegracao = $jsonIntegracao | ConvertFrom-Json
    if ($contaIntegracao.type -ne 'service_account' -or $contaIntegracao.project_id -ne 'lv-maker' -or !$contaIntegracao.private_key) { throw 'A credencial precisa ser uma conta de serviço do projeto lv-maker.' }
    EnviarSegredoIntegracao 'FIREBASE_SERVICE_ACCOUNT' $jsonIntegracao
} finally { $jsonIntegracao = $null; $contaIntegracao = $null }
if ($SomenteFirebase) {
    Write-Host 'Acesso ao Firebase cadastrado no Cloudflare. A credencial do Melhor Envio será conectada na próxima etapa.'
    return
}
$segredoIntegracao = Read-Host 'Token do Melhor Envio (entrada protegida)' -AsSecureString
$ponteiroIntegracao = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredoIntegracao)
try {
    $tokenIntegracao = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiroIntegracao).Trim()
    if ($tokenIntegracao.Length -lt 40 -or $tokenIntegracao -match '\s') { throw 'Confira o token copiado no Melhor Envio.' }
    EnviarSegredoIntegracao 'MELHOR_ENVIO_TOKEN' $tokenIntegracao
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiroIntegracao); $tokenIntegracao = $null; $segredoIntegracao.Dispose() }
Write-Host 'Credenciais cadastradas. Falta conferir o ambiente, publicar a configuração e testar uma operação controlada.'
