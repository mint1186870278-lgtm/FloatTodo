Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,53,58,63))
$g.FillEllipse($brush,8,8,240,240)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White),17
$pen.StartCap = 'Round'
$pen.EndCap = 'Round'
$g.DrawLines($pen,[System.Drawing.Point[]]@((New-Object System.Drawing.Point 69,127),(New-Object System.Drawing.Point 108,165),(New-Object System.Drawing.Point 187,86)))
$bitmap.Save((Join-Path $assetDir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$png = [System.IO.File]::ReadAllBytes((Join-Path $assetDir 'icon.png'))
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
[System.IO.File]::WriteAllBytes((Join-Path $assetDir 'icon.ico'),$stream.ToArray())
$writer.Dispose(); $stream.Dispose(); $g.Dispose(); $brush.Dispose(); $pen.Dispose(); $bitmap.Dispose()
