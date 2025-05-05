# YouTube ダウンローダー

yt-dlpを使用したシンプルなYouTubeダウンロードWebアプリケーションです。ブラウザから簡単にYouTube動画をダウンロードできます。

## 機能

- YouTubeのURLから動画情報を取得
- 動画の品質を選択してダウンロード
- 音声のみのダウンロードオプション
- リアルタイムのダウンロード進捗表示
- ブラウザから直接ファイルをダウンロード

## 動作要件

- [Bun](https://bun.sh/) 1.0以上
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (PATHに追加してください)

## インストール

1. リポジトリをクローン:
   ```
   git clone https://github.com/yourusername/youtube-downloader.git
   cd youtube-downloader
   ```

2. 依存関係をインストール:
   ```
   bun install
   ```

3. yt-dlpがインストールされていることを確認:
   ```
   yt-dlp --version
   ```

## 使い方

### 開発モード

```
bun dev
```

### 本番モード

```
bun start
```

アプリケーションが起動すると、自動的にブラウザが開きます。
（デフォルトのポートは3000です。環境変数`PORT`で変更できます）

## 使用技術

- [Bun](https://bun.sh/) - JavaScript/TypeScriptランタイム
- [Hono](https://hono.dev/) - 軽量なWebフレームワーク
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 動画ダウンロードライブラリ
- [@j3lte/ytdl-wrapper](https://jsr.io/@j3lte/ytdl-wrapper) - yt-dlpのJavaScriptラッパー

## ライセンス

MIT
