[CmdletBinding()]
param(
    [switch]$NewProject,
    [string]$ProjectName = 'account-manage',
    [string]$ServiceName = 'account-manage',
    [switch]$SkipDeploy,
    [switch]$SkipDomain
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Railway {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & $script:RailwayCommand @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Railway 命令执行失败：railway $($Arguments -join ' ')"
    }
    return $exitCode
}

function Test-RailwayLink {
    & $script:RailwayCommand status --json *> $null
    return $LASTEXITCODE -eq 0
}

Write-Host '=== Railway 一键配置 ===' -ForegroundColor Cyan

$railway = Get-Command railway -ErrorAction SilentlyContinue
if (-not $railway) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw '未找到 npm。请先安装 Node.js 18 或更高版本。'
    }

    Write-Host '正在安装 Railway CLI...'
    & $npm.Source install --global @railway/cli
    if ($LASTEXITCODE -ne 0) {
        throw 'Railway CLI 安装失败。'
    }
    $railway = Get-Command railway -ErrorAction Stop
}
$script:RailwayCommand = $railway.Source

Write-Host '检查 Railway 登录状态...'
& $script:RailwayCommand whoami *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '请在接下来打开的页面中登录 Railway。'
    Invoke-Railway -Arguments @('login') | Out-Null
}

if (-not (Test-RailwayLink)) {
    if ($NewProject) {
        Write-Host "创建 Railway 项目：$ProjectName"
        Invoke-Railway -Arguments @('init', '--name', $ProjectName) | Out-Null
        Write-Host "创建应用服务：$ServiceName"
        Invoke-Railway -Arguments @('add', '--service', $ServiceName) | Out-Null
    } else {
        Write-Host '请选择已有的 Railway 项目、环境和服务。'
        Invoke-Railway -Arguments @('link') | Out-Null
    }
}

if (-not (Test-RailwayLink)) {
    throw '当前目录尚未成功关联 Railway 项目或服务。'
}

Write-Host '请输入管理员初始密码（不会写入文件或 Git）：'
$securePassword = Read-Host -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrWhiteSpace($plainPassword) -or $plainPassword.Length -lt 8) {
        throw '管理员密码至少需要 8 位。'
    }

    $plainPassword | & $script:RailwayCommand variable set ADMIN_PASSWORD --stdin --skip-deploys
    if ($LASTEXITCODE -ne 0) {
        throw '设置 ADMIN_PASSWORD 失败。'
    }
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $plainPassword = $null
}

Write-Host '设置数据目录和 Python 命令...'
Invoke-Railway -Arguments @(
    'variable', 'set',
    'DATA_DIR=/data',
    'PYTHON_BIN=python3',
    '--skip-deploys'
) | Out-Null

Write-Host '检查持久化卷...'
$volumeList = & $script:RailwayCommand volume list 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    throw '无法读取 Railway Volume 列表。'
}
if ($volumeList -notmatch '(?m)(^|\s)/data(\s|$)') {
    Invoke-Railway -Arguments @('volume', 'add', '--mount-path', '/data') | Out-Null
    Write-Host '已创建并挂载 /data 持久化卷。' -ForegroundColor Green
} else {
    Write-Host '/data 持久化卷已经存在。'
}

if (-not $SkipDeploy) {
    Write-Host '开始部署项目...'
    Invoke-Railway -Arguments @('up', '--ci') | Out-Null
}

if (-not $SkipDomain) {
    Write-Host '生成或读取 Railway 公网域名...'
    & $script:RailwayCommand domain
    if ($LASTEXITCODE -ne 0) {
        Write-Host '域名可能已经存在，请到 Railway 的 Networking 页面查看。' -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Railway 配置完成。' -ForegroundColor Green
Write-Host '可运行 railway open 打开项目控制台。'
