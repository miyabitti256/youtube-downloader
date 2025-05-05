import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ytdlWrapper from "@j3lte/ytdl-wrapper";

// yt-dlpの実行ファイルのパス
const YT_DLP_PATH = resolve("./bin/yt-dlp.exe");

// ダウンロード先のディレクトリ
const DOWNLOADS_DIR = resolve("./downloads");

// ダウンロードディレクトリが存在しない場合は作成
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// ytdl-wrapperインスタンスの作成
const ytdlInstance = new ytdlWrapper.YTDLWrapper(YT_DLP_PATH);

// ダウンロードオプションの型定義
interface DownloadOptions {
  url: string;
  format?: string;
  quality?: string;
  output?: string;
  audioOnly?: boolean;
  videoOnly?: boolean;
  additionalOptions?: Record<string, string | boolean | number>;
}

// 進捗情報の型定義
interface ProgressInfo {
  percent: number | string | null | undefined;
  totalSize: string | undefined;
  currentSpeed: string | undefined;
  eta: string | undefined;
  timestamp: number;
}

class YtdlService {
  /**
   * yt-dlpの状態を確認
   */
  async checkStatus() {
    try {
      const version = execSync(`"${YT_DLP_PATH}" --version`, {
        encoding: "utf8",
      }).trim();
      return {
        executable: YT_DLP_PATH,
        version,
        working: true,
      };
    } catch (error) {
      console.error("yt-dlpの状態確認中にエラーが発生しました:", error);
      return {
        executable: YT_DLP_PATH,
        working: false,
        error: String(error),
      };
    }
  }

  /**
   * 動画情報を取得
   */
  async getVideoInfo(url: string) {
    try {
      // getMediaInfoメソッドを使用
      const mediaInfo = await ytdlInstance.getMediaInfo(url);
      return mediaInfo;
    } catch (error) {
      console.error("動画情報の取得中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * 利用可能なフォーマットを取得
   */
  async getAvailableFormats(url: string) {
    try {
      // execメソッドを使用してformat一覧を取得
      const result = ytdlInstance.exec([
        url,
        "--list-formats",
        "--no-warnings",
        "--no-call-home",
        "--skip-download",
      ]);

      return new Promise<string>((resolve, reject) => {
        let output = "";

        // イベント型を回避するために汎用的なonメソッドを使用
        result.on("event", (_eventType: string, eventData: string) => {
          output += `${eventData}\n`;
        });

        result.on("error", (err) => {
          reject(err);
        });

        result.on("close", () => {
          resolve(output);
        });
      });
    } catch (error) {
      console.error("フォーマット情報の取得中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * 動画をダウンロード
   */
  async downloadVideo(options: DownloadOptions) {
    const {
      url,
      format,
      quality,
      output,
      audioOnly,
      videoOnly,
      additionalOptions,
    } = options;

    try {
      const args = [url];

      // 出力ファイル
      args.push("-o", join(DOWNLOADS_DIR, output || "%(title)s.%(ext)s"));

      // 警告と電話を無効化
      args.push("--no-warnings", "--no-call-home");

      // フォーマット指定
      if (format) {
        args.push("-f", format);
      } else if (audioOnly) {
        args.push("--extract-audio");

        // 音声フォーマットの指定（追加オプションから取得）
        const audioFormat = (additionalOptions?.audioFormat as string) || "mp3";
        args.push("--audio-format", audioFormat);

        args.push("--audio-quality", quality || "0");
      } else if (videoOnly) {
        args.push("-f", "bestvideo");
      } else if (quality) {
        // 品質に基づいたフォーマット選択
        let formatString = "";
        switch (quality) {
          case "best":
            formatString = "bestvideo+bestaudio/best";
            break;
          case "1080p":
            formatString =
              "bestvideo[height<=1080]+bestaudio/best[height<=1080]";
            break;
          case "720p":
            formatString = "bestvideo[height<=720]+bestaudio/best[height<=720]";
            break;
          case "480p":
            formatString = "bestvideo[height<=480]+bestaudio/best[height<=480]";
            break;
          case "360p":
            formatString = "bestvideo[height<=360]+bestaudio/best[height<=360]";
            break;
          default:
            formatString = quality;
        }
        args.push("-f", formatString);
      } else {
        // デフォルトは最高品質
        args.push("-f", "bestvideo+bestaudio/best");
      }

      // 動画を特定の形式に変換する場合
      if (!audioOnly && additionalOptions?.remuxVideo) {
        args.push("--remux-video", additionalOptions.remuxVideo as string);
      }

      // 追加オプションの適用
      if (additionalOptions) {
        for (const [key, value] of Object.entries(additionalOptions)) {
          // 既に処理した特殊オプションはスキップ
          if (["audioFormat", "remuxVideo"].includes(key)) continue;

          if (typeof value === "boolean") {
            if (value === true) {
              args.push(`--${key}`);
            }
          } else {
            args.push(`--${key}`, String(value));
          }
        }
      }

      // ダウンロード実行
      const eventEmitter = ytdlInstance.exec(args);

      return new Promise<{
        stdout: string;
        stderr: string;
        success: boolean;
        options: string[];
        progress: ProgressInfo[];
      }>((resolve, _reject) => {
        let stdout = "";
        let stderr = "";
        const progressData: ProgressInfo[] = [];

        // イベントハンドラー設定
        eventEmitter.on("event", (eventType: string, eventData: string) => {
          stdout += `[${eventType}] ${eventData}\n`;
        });

        // 進捗状況を取得
        eventEmitter.on("progress", (progress: ytdlWrapper.Progress) => {
          const progressInfo: ProgressInfo = {
            percent: progress.percent,
            totalSize: progress.totalSize,
            currentSpeed: progress.currentSpeed,
            eta: progress.eta,
            timestamp: Date.now(),
          };
          progressData.push(progressInfo);

          // コンソールに進捗を出力（デバッグ用）
          console.log(
            `進捗: ${progress.percent || 0}%, 速度: ${progress.currentSpeed || "N/A"}, 残り時間: ${progress.eta || "N/A"}`,
          );
        });

        eventEmitter.on("error", (err) => {
          stderr += `${String(err)}\n`;
        });

        eventEmitter.on("close", (code) => {
          resolve({
            stdout,
            stderr,
            success: code === 0,
            options: args,
            progress: progressData,
          });
        });
      });
    } catch (error) {
      console.error("ダウンロード中にエラーが発生しました:", error);
      throw error;
    }
  }

  /**
   * ダウンロード済みファイルの一覧を取得
   */
  async getDownloadedFiles() {
    try {
      const files = readdirSync(DOWNLOADS_DIR)
        .filter((file) => {
          const fullPath = join(DOWNLOADS_DIR, file);
          return statSync(fullPath).isFile();
        })
        .map((file) => {
          const fullPath = join(DOWNLOADS_DIR, file);
          const stats = statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
          };
        });

      return {
        directory: DOWNLOADS_DIR,
        files,
      };
    } catch (error) {
      console.error(
        "ダウンロードファイル一覧の取得中にエラーが発生しました:",
        error,
      );
      throw error;
    }
  }
}

export const ytdl = new YtdlService();
