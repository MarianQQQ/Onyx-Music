Add-Type -AssemblyName System.Drawing

function Create-HeaderBmp {
    param([string]$outputPath, [string]$iconPath)
    
    $width = 150
    $height = 57
    
    # Create 24-bit RGB bitmap
    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    
    # Background #0a0a0a with very subtle gradient to #141414
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $height)),
        [System.Drawing.Color]::FromArgb(18, 18, 18),
        [System.Drawing.Color]::FromArgb(10, 10, 10)
    )
    $g.FillRectangle($bgBrush, 0, 0, $width, $height)
    $bgBrush.Dispose()
    
    # Red accent line at bottom (#ff2222)
    $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 34, 34), 2)
    $g.DrawLine($accentPen, 0, $height - 1, $width, $height - 1)
    $accentPen.Dispose()
    
    # Subtle top edge highlight (1px dark grey)
    $topPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 35, 35), 1)
    $g.DrawLine($topPen, 0, 0, $width, 0)
    $topPen.Dispose()
    
    # Draw YT Music Icon (size 34x34)
    if (Test-Path $iconPath) {
        $iconImg = [System.Drawing.Image]::FromFile($iconPath)
        $iconRect = New-Object System.Drawing.Rectangle(10, 11, 34, 34)
        
        # Subtle glow behind icon
        $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 255, 34, 34))
        $g.FillEllipse($glowBrush, 8, 9, 38, 38)
        $glowBrush.Dispose()
        
        $g.DrawImage($iconImg, $iconRect)
        $iconImg.Dispose()
    }
    
    # Typography: "ONYX"
    $fontFamily = "JetBrains Mono"
    try {
        $testFont = New-Object System.Drawing.Font($fontFamily, 11, [System.Drawing.FontStyle]::Bold)
    } catch {
        $fontFamily = "Consolas"
    }
    
    $titleFont = New-Object System.Drawing.Font($fontFamily, 10, [System.Drawing.FontStyle]::Bold)
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 250, 250))
    $g.DrawString("ONYX MUSIC", $titleFont, $titleBrush, 50, 11)
    $titleBrush.Dispose()
    $titleFont.Dispose()
    
    # Subtitle: "DESKTOP" in retro red
    $subFont = New-Object System.Drawing.Font($fontFamily, 7.5, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 34))
    $g.DrawString("DESKTOP", $subFont, $subBrush, 51, 30)
    $subBrush.Dispose()
    $subFont.Dispose()
    
    # Clean up graphics
    $g.Dispose()
    
    # Ensure standard 24bpp uncompressed BMP
    $bmp24 = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g2 = [System.Drawing.Graphics]::FromImage($bmp24)
    $g2.DrawImage($bmp, 0, 0)
    $g2.Dispose()
    $bmp.Dispose()
    
    $bmp24.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp24.Dispose()
    Write-Host "Created: $outputPath"
}

function Create-SidebarBmp {
    param([string]$outputPath, [string]$iconPath)
    
    $width = 164
    $height = 314
    
    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    
    # Deep OLED black background (#050505) with sleek gradient to #110505 in middle and back to #050505
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $height)),
        [System.Drawing.Color]::FromArgb(12, 6, 6),
        [System.Drawing.Color]::FromArgb(5, 5, 5)
    )
    $g.FillRectangle($bgBrush, 0, 0, $width, $height)
    $bgBrush.Dispose()
    
    # Top red accent bar
    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 34))
    $g.FillRectangle($accentBrush, 0, 0, $width, 2)
    
    # Bottom red accent bar
    $g.FillRectangle($accentBrush, 0, $height - 3, $width, 3)
    $accentBrush.Dispose()
    
    # Subtle dark grid or equalizer lines in the background
    $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 18, 20), 1)
    for ($y = 20; $y -lt $height - 20; $y += 24) {
        $g.DrawLine($gridPen, 10, $y, $width - 10, $y)
    }
    $gridPen.Dispose()
    
    # Glowing Onyx Emblem
    $emblemSize = 68
    $emblemX = [int](($width - $emblemSize) / 2)
    $emblemY = 46
    
    # Multi-layer red glow around emblem
    $glowLayers = @(
        @{ size = 110; alpha = 12 },
        @{ size = 96;  alpha = 24 },
        @{ size = 84;  alpha = 45 },
        @{ size = 74;  alpha = 75 }
    )
    foreach ($layer in $glowLayers) {
        $layerSize = $layer.size
        $layerX = [int]($emblemX + ($emblemSize - $layerSize) / 2)
        $layerY = [int]($emblemY + ($emblemSize - $layerSize) / 2)
        $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($layer.alpha, 255, 34, 34))
        $g.FillEllipse($brush, $layerX, $layerY, $layerSize, $layerSize)
        $brush.Dispose()
    }
    
    # Draw main icon
    if (Test-Path $iconPath) {
        $iconImg = [System.Drawing.Image]::FromFile($iconPath)
        $iconRect = New-Object System.Drawing.Rectangle($emblemX, $emblemY, $emblemSize, $emblemSize)
        $g.DrawImage($iconImg, $iconRect)
        $iconImg.Dispose()
    }
    
    # Typography
    $fontFamily = "JetBrains Mono"
    try {
        $testFont = New-Object System.Drawing.Font($fontFamily, 11, [System.Drawing.FontStyle]::Bold)
    } catch {
        $fontFamily = "Consolas"
    }
    
    # String format centered
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    
    # "ONYX MUSIC"
    $titleFont = New-Object System.Drawing.Font($fontFamily, 12, [System.Drawing.FontStyle]::Bold)
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255))
    $titleRect = New-Object System.Drawing.RectangleF(0, ($emblemY + $emblemSize + 12), $width, 24)
    $g.DrawString("ONYX MUSIC", $titleFont, $titleBrush, $titleRect, $sf)
    $titleBrush.Dispose()
    $titleFont.Dispose()
    
    # Decorative red line divider
    $dividerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 34, 34), 2)
    $g.DrawLine($dividerPen, [int]($width/2 - 28), [int]($emblemY + $emblemSize + 39), [int]($width/2 + 28), [int]($emblemY + $emblemSize + 39))
    $dividerPen.Dispose()
    
    # "ONYX MUSIC - DESKTOP CLIENT"
    $subFont = New-Object System.Drawing.Font($fontFamily, 6.5, [System.Drawing.FontStyle]::Bold)
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 60, 60))
    $subRect = New-Object System.Drawing.RectangleF(0, ($emblemY + $emblemSize + 44), $width, 18)
    $g.DrawString("ONYX MUSIC - DESKTOP CLIENT", $subFont, $subBrush, $subRect, $sf)
    $subBrush.Dispose()
    $subFont.Dispose()
    
    # Retro Audio Equalizer Visualizer Bars in bottom section
    $eqY = 210
    $eqHeight = 28
    $barWidth = 4
    $barGap = 3
    $barHeights = @(10, 16, 22, 14, 26, 18, 28, 22, 15, 25, 20, 27, 18, 12, 24, 16, 20, 12)
    $totalWidth = ($barHeights.Length * ($barWidth + $barGap)) - $barGap
    $startX = [int](($width - $totalWidth) / 2)
    
    for ($i = 0; $i -lt $barHeights.Length; $i++) {
        $h = $barHeights[$i]
        $bx = $startX + ($i * ($barWidth + $barGap))
        $by = $eqY + ($eqHeight - $h)
        
        $yBottom = $eqY + $eqHeight
        $barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
            (New-Object System.Drawing.Point($bx, $by)),
            (New-Object System.Drawing.Point($bx, $yBottom)),
            [System.Drawing.Color]::FromArgb(255, 60, 60),
            [System.Drawing.Color]::FromArgb(140, 20, 20)
        )
        $g.FillRectangle($barBrush, $bx, $by, $barWidth, $h)
        $barBrush.Dispose()
    }

    
    # Bottom metadata / retro mono badges
    $metaFont = New-Object System.Drawing.Font($fontFamily, 6.5, [System.Drawing.FontStyle]::Regular)
    $metaBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 100, 105))
    
    $metaRect1 = New-Object System.Drawing.RectangleF(0, 252, $width, 14)
    $g.DrawString("OLED EDITION", $metaFont, $metaBrush, $metaRect1, $sf)
    
    $metaBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(65, 65, 70))
    $metaRect2 = New-Object System.Drawing.RectangleF(0, 268, $width, 14)
    $g.DrawString("HIGH FIDELITY AUDIO", $metaFont, $metaBrush2, $metaRect2, $sf)
    
    $metaBrush.Dispose()
    $metaBrush2.Dispose()
    $metaFont.Dispose()
    $sf.Dispose()
    
    # Clean up
    $g.Dispose()
    
    # Ensure 24bpp uncompressed BMP
    $bmp24 = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g2 = [System.Drawing.Graphics]::FromImage($bmp24)
    $g2.DrawImage($bmp, 0, 0)
    $g2.Dispose()
    $bmp.Dispose()
    
    $bmp24.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp24.Dispose()
    Write-Host "Created: $outputPath"
}

$iconPath = "F:\Github\Active\YT Music\src-tauri\icons\icon.png"
$headerOut = "F:\Github\Active\YT Music\src-tauri\icons\header.bmp"
$sidebarOut = "F:\Github\Active\YT Music\src-tauri\icons\sidebar.bmp"

Create-HeaderBmp -outputPath $headerOut -iconPath $iconPath
Create-SidebarBmp -outputPath $sidebarOut -iconPath $iconPath
