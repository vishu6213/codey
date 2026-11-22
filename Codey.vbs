Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\vishv\Downloads\codiey\codey"
WshShell.Run "node apps/desktop/scripts/start-electron.mjs", 0, False

