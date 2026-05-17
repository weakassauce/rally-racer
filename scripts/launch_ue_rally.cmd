@echo off
set UE="C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe"
set PROJ="C:\Users\rdhud\Documents\Unreal Projects\PhotoRealisticPvE\PhotoRealisticPvE.uproject"
set PY="C:\Users\rdhud\Documents\Unreal Projects\PhotoRealisticPvE\Content\Python\setup_rally_full.py"
start "" %UE% %PROJ% -ExecutePythonScript=%PY%
