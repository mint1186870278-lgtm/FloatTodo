param([ValidateSet('cursor','click','drag','hotkey','capture','activate','focus','probe','sweep')][string]$Action,[int]$X,[int]$Y,[int]$EndX,[int]$EndY,[int]$Width,[int]$Height,[string]$OutputPath,[int]$HotkeyCode=84,[long]$WindowHandle)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class FloatTodoNativeTest {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(long point);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
[FloatTodoNativeTest]::SetProcessDPIAware() | Out-Null
if ($Action -eq 'sweep') {
  for ($cycle=0; $cycle -lt 8; $cycle++) {
    [FloatTodoNativeTest]::SetCursorPos($X,$Y) | Out-Null
    Start-Sleep -Milliseconds 40
    [FloatTodoNativeTest]::SetCursorPos($EndX,$EndY) | Out-Null
    Start-Sleep -Milliseconds 40
  }
}
if ($Action -eq 'probe') {
  $packedPoint = ([long]$Y -shl 32) -bor [long]$X
  $hit = [FloatTodoNativeTest]::WindowFromPoint($packedPoint)
  Write-Output "main=$WindowHandle exStyle=$([FloatTodoNativeTest]::GetWindowLongPtr([IntPtr]$WindowHandle,-20)) hit=$hit root=$([FloatTodoNativeTest]::GetAncestor($hit,2)) foreground=$([FloatTodoNativeTest]::GetForegroundWindow())"
}
if ($Action -eq 'activate') {
  [FloatTodoNativeTest]::SetWindowPos([IntPtr]$WindowHandle,[IntPtr](-1),0,0,0,0,0x43) | Out-Null
  [FloatTodoNativeTest]::SetForegroundWindow([IntPtr]$WindowHandle) | Out-Null
}
if ($Action -eq 'focus') {
  # Windows foreground lock may reject a background automation process; an Alt
  # keystroke is the standard user-input activation path, not a registry change.
  [FloatTodoNativeTest]::keybd_event(18,0,0,[UIntPtr]::Zero)
  [FloatTodoNativeTest]::keybd_event(18,0,2,[UIntPtr]::Zero)
  # Raise this known test window among normal windows without making it topmost.
  [FloatTodoNativeTest]::SetWindowPos([IntPtr]$WindowHandle,[IntPtr]::Zero,0,0,0,0,0x53) | Out-Null
  [FloatTodoNativeTest]::SetForegroundWindow([IntPtr]$WindowHandle) | Out-Null
}
if ($Action -eq 'cursor' -or $Action -eq 'click' -or $Action -eq 'drag') {
  [FloatTodoNativeTest]::SetCursorPos($X,$Y) | Out-Null
  # A real pointer traverses the hit boundary before mouse-down. Give the
  # transparent-window hit router two frames after an artificial cursor jump.
  if ($Action -eq 'drag') { Start-Sleep -Milliseconds 30 }
  if ($Action -ne 'cursor') {
    [FloatTodoNativeTest]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    if ($Action -eq 'drag') {
      Start-Sleep -Milliseconds 120
      for ($step = 1; $step -le 10; $step++) {
        [FloatTodoNativeTest]::SetCursorPos([int]($X+($EndX-$X)*$step/10),[int]($Y+($EndY-$Y)*$step/10)) | Out-Null
        Start-Sleep -Milliseconds 20
      }
    }
    [FloatTodoNativeTest]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  }
}
if ($Action -eq 'hotkey') {
  foreach ($key in @(17,18,16,$HotkeyCode)) {[FloatTodoNativeTest]::keybd_event([byte]$key,0,0,[UIntPtr]::Zero)}
  Start-Sleep -Milliseconds 80
  foreach ($key in @($HotkeyCode,16,18,17)) {[FloatTodoNativeTest]::keybd_event([byte]$key,0,2,[UIntPtr]::Zero)}
}
if ($Action -eq 'capture') {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap $Width,$Height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.CopyFromScreen($X,$Y,0,0,$bmp.Size)
  $bmp.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
  $pixel = $bmp.GetPixel([int]($Width/2),[int]($Height/2))
  Write-Output "$($pixel.R),$($pixel.G),$($pixel.B)"
  $graphics.Dispose(); $bmp.Dispose()
}
