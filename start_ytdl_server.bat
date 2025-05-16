@echo off
setlocal EnableDelayedExpansion

rem コマンドプロンプトをUTF-8モードに設定
chcp 65001 > nul

set "PROJECT_DIR=%~dp0"
set "BIN_DIR=%PROJECT_DIR%bin"
set "BUN_EXE=%BIN_DIR%\bun.exe"
set "BUN_ZIP_URL=https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip"
set "BUN_ZIP_PATH=%TEMP%\bun-windows-x64.zip"

echo Bun.exe のパス: %BUN_EXE%

if exist "%BUN_EXE%" (
    echo bun.exe が見つかりました。
) else (
    echo bun.exe が見つかりません。ダウンロードします...
    
    rem binフォルダ作成
    if not exist "%BIN_DIR%" (
        echo binフォルダを作成します...
        mkdir "%BIN_DIR%"
    )
    
    rem ZIPダウンロード
    echo PowerShellを使用してbunをダウンロードしています...
    powershell -Command "& {$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%BUN_ZIP_URL%' -OutFile '%BUN_ZIP_PATH%'}"
    
    if errorlevel 1 (
        echo エラー: ダウンロードに失敗しました
        pause
        exit /b 1
    )
    
    rem ZIP解凍
    echo ZIPファイルを解凍しています...
    powershell -Command "& {$ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%BUN_ZIP_PATH%' -DestinationPath '%BIN_DIR%' -Force}"
    
    if errorlevel 1 (
        echo エラー: 解凍に失敗しました
        pause
        exit /b 1
    )
    
    rem 解凍されたbun.exeを検索してbinフォルダに移動
    echo bun.exeをbinフォルダに移動しています...
    
    set "BUN_FOUND=0"
    
    rem サブディレクトリ内のbun.exeを検索
    if exist "%BIN_DIR%\bun-windows-x64\bun.exe" (
        echo サブフォルダからbun.exeを移動します...
        move "%BIN_DIR%\bun-windows-x64\bun.exe" "%BUN_EXE%" >nul
        set "BUN_FOUND=1"
        
        echo 空のサブフォルダを削除します...
        rmdir "%BIN_DIR%\bun-windows-x64" 2>nul
    ) else (
        echo サブフォルダ内でbun.exeを検索しています...
        for /r "%BIN_DIR%" %%f in (bun.exe) do (
            echo "%%f" を "%BUN_EXE%" に移動します
            move "%%f" "%BUN_EXE%" >nul
            set "BUN_FOUND=1"
            
            rem 親フォルダのパスを取得
            for %%d in ("%%f\..") do (
                echo サブフォルダ "%%~fd" が空の場合は削除します...
                rmdir "%%~fd" 2>nul
            )
        )
    )
    
    rem 一時ファイルを削除
    if exist "%BUN_ZIP_PATH%" (
        echo 一時ファイルを削除しています...
        del "%BUN_ZIP_PATH%"
    )
    
    rem インストール結果を確認
    if exist "%BUN_EXE%" (
        echo bun.exe のインストールが完了しました
    ) else (
        echo エラー: bun.exeのインストールに失敗しました
        
        echo binフォルダの内容:
        dir /s "%BIN_DIR%"
        
        pause
        exit /b 1
    )
)

echo サーバーを起動します...

rem 依存関係のインストール
echo 依存関係をインストールしています...
call "%BUN_EXE%" install
if errorlevel 1 (
    echo エラー: 依存関係のインストールに失敗しました
    pause
    exit /b 1
)

rem サーバー起動
echo サーバーを起動しています...
call "%BUN_EXE%" run start
if errorlevel 1 (
    echo エラー: サーバーの起動に失敗しました
)

pause 