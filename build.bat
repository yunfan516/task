@echo off
zig cc -target wasm32-freestanding -O2 -nostdlib sort_core.c -Wl,--no-entry -Wl,--export-memory -Wl,--initial-memory=16777216 -Wl,--max-memory=16777216 -Wl,--strip-all -o sort_core.wasm
if errorlevel 1 exit /b 1
echo Built sort_core.wasm from sort_core.c
