Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot "..\desktop\assets"
if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
}

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Clear background to transparent
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded rectangle container path
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$rect = New-Object System.Drawing.Rectangle 12, 12, 232, 232
$radius = 48
$d = $radius * 2
$path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
$path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
$path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
$path.CloseFigure()

# Fill dark card background (#0a0f1d)
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 10, 15, 29))
$g.FillPath($bgBrush, $path)

# Neon lime border (#a3e635)
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 163, 230, 53), 4)
$g.DrawPath($borderPen, $path)

# Subtle cyan inner border (#00f0ff)
$innerRect = New-Object System.Drawing.Rectangle 18, 18, 220, 220
$innerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$innerRadius = 42
$id = $innerRadius * 2
$innerPath.AddArc($innerRect.X, $innerRect.Y, $id, $id, 180, 90)
$innerPath.AddArc($innerRect.Right - $id, $innerRect.Y, $id, $id, 270, 90)
$innerPath.AddArc($innerRect.Right - $id, $innerRect.Bottom - $id, $id, $id, 0, 90)
$innerPath.AddArc($innerRect.X, $innerRect.Bottom - $id, $id, $id, 90, 90)
$innerPath.CloseFigure()
$innerPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 0, 240, 255), 1.5)
$g.DrawPath($innerPen, $innerPath)

# Stylized 'R' in center
$fontFamily = [System.Drawing.FontFamily]::GenericSansSerif
$font = New-Object System.Drawing.Font ($fontFamily, 120, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center

# Glow behind R
$glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 163, 230, 53))
$layoutRect = New-Object System.Drawing.RectangleF 12, 14, 232, 232
$g.DrawString("R", $font, $glowBrush, $layoutRect, $sf)

# Gradient brush for R
$pt1 = New-Object System.Drawing.Point 40, 40
$pt2 = New-Object System.Drawing.Point 216, 216
$col1 = [System.Drawing.Color]::FromArgb(255, 163, 230, 53)
$col2 = [System.Drawing.Color]::FromArgb(255, 0, 240, 255)
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($pt1, $pt2, $col1, $col2)
$textRect = New-Object System.Drawing.RectangleF 12, 10, 232, 232
$g.DrawString("R", $font, $gradBrush, $textRect, $sf)

$outPath = Join-Path $assetsDir "icon.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Save Windows native .ico
$icoPath = Join-Path $assetsDir "icon.ico"
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()

$g.Dispose()
$bmp.Dispose()
Write-Output "Successfully saved icon to: $outPath and $icoPath"
