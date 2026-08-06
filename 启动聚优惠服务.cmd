@echo off
chcp 65001 >nul
title 聚优惠本地服务
cd /d "%~dp0"
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Users\HUAWEI\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODE%" set "NODE=D:\nodejs\node.exe"
start "" /min "%NODE%" server.js
ping -n 4 127.0.0.1 >nul
start http://localhost:3000
