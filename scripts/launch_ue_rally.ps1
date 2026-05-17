# Launch UE5 editor with the PhotoRealisticPvE project and auto-run the
# rally setup Python script on startup.

$ue = 'C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe'
$proj = 'C:\Users\rdhud\Documents\Unreal Projects\PhotoRealisticPvE\PhotoRealisticPvE.uproject'
$pyScript = 'C:\Users\rdhud\Documents\Unreal Projects\PhotoRealisticPvE\Content\Python\setup_rally_full.py'

Start-Process $ue -ArgumentList @(
    "`"$proj`"",
    "-ExecutePythonScript=`"$pyScript`""
)
Write-Host "UE editor launching with rally setup..."
