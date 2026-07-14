param([int]$Port = 8000)

$root = (Resolve-Path $PSScriptRoot).Path
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"

function Get-ContentType([string]$Path) {
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.js'   { 'application/javascript; charset=utf-8' }
    '.csv'  { 'text/csv; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.svg'  { 'image/svg+xml' }
    default { 'application/octet-stream' }
  }
}

try {
  while ($listener.Server.IsBound) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      $headerLine = $reader.ReadLine()
      while ($null -ne $headerLine -and $headerLine -ne '') { $headerLine = $reader.ReadLine() }
      $parts = $requestLine -split ' '
      $relative = if ($parts.Length -ge 2) { [Uri]::UnescapeDataString(($parts[1] -split '\?')[0].TrimStart('/')) } else { '' }
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $relative))
      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $status = '404 Not Found'
        $type = 'text/plain; charset=utf-8'
        $body = [Text.Encoding]::UTF8.GetBytes('Not found')
      } else {
        $status = '200 OK'
        $type = Get-ContentType $file
        $body = [IO.File]::ReadAllBytes($file)
      }
      $header = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
      $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } finally {
      if ($stream) { $stream.Dispose() }
      $client.Dispose()
    }
  }
} finally {
  $listener.Stop()
}
