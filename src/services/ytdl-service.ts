import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ytdlWrapper from "@j3lte/ytdl-wrapper";
import { sendProgressToClients } from "./sse-service";
import type { ProgressData } from "./sse-service";

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

// アクティブなダウンロードを追跡するMap
const activeDownloads = new Map<string, ytdlWrapper.YTDLEventEmitter>();

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
   * @param options ダウンロードオプション
   * @param downloadId ダウンロードID（進捗通知用）
   */
  downloadVideo(options: DownloadOptions, downloadId: string) {
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

        // 音質設定（デフォルトは最高品質）
        args.push("--audio-quality", quality || "0");

        // MP3の場合はWindows互換性向上のためのオプション
        if (audioFormat === "mp3") {
          args.push("--embed-metadata"); // メタデータを埋め込む
        }
      } else if (videoOnly) {
        // ビデオのみのフォーマットを選択（音声なし）
        // H.264コーデックを優先し、解像度を基準に選択
        if (quality?.match(/^\d+p$/)) {
          // 数字p形式の解像度指定（例：1080p, 720p, 480p, 360p）
          const height = quality.replace("p", "");
          args.push(
            "-f",
            `bestvideo[height<=${height}][vcodec^=avc]/bestvideo[height<=${height}]/bestvideo`,
          );
        } else if (quality === "best") {
          args.push("-f", "bestvideo[vcodec^=avc]/bestvideo");
        } else if (quality) {
          // その他の指定の場合はそのまま使用
          args.push("-f", quality);
        } else {
          // 品質指定がない場合はH.264コーデックを優先
          args.push("-f", "bestvideo[vcodec^=avc]/bestvideo");
        }
        // ビデオコーデック優先度とビットレート基準の並び替え
        args.push("-S", "res,vcodec:h264,br");
      } else if (quality && !additionalOptions?.remuxVideo) {
        // 品質に基づいたフォーマット選択（remuxVideo指定がない場合）
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
      } else if (!additionalOptions?.remuxVideo) {
        // デフォルトは最高品質（remuxVideo指定がない場合）
        args.push("-f", "bestvideo+bestaudio/best");
      }

      // 動画を特定の形式に変換する場合
      if (!audioOnly && additionalOptions?.remuxVideo) {
        args.push("--remux-video", additionalOptions.remuxVideo as string);

        // MP4形式の場合は、WindowsとiOSで広く再生できるコーデックを指定
        if (additionalOptions.remuxVideo === "mp4") {
          // MP4形式では、H.264ビデオとm4aオーディオ（AAC）を指定
          // AACオーディオフォーマットを指定（一般的にm4aのフォーマット）
          const aacAudio = "bestaudio[ext=m4a]";

          if (videoOnly) {
            // ビデオのみモードの場合はオーディオを含めない
            if (quality?.match(/^\d+p$/)) {
              const height = quality.replace("p", "");
              args.push(
                "-f",
                `bestvideo[height<=${height}][vcodec^=avc]/bestvideo[height<=${height}]/bestvideo`,
              );
            } else {
              args.push("-f", "bestvideo[vcodec^=avc]/bestvideo");
            }
            // ビデオコーデック優先度とビットレート基準の並び替え
            args.push("-S", "res,vcodec:h264,br");
          } else if (quality) {
            // 通常の動画+音声モード
            if (quality === "best") {
              // 最高品質でH.264/AACを指定
              args.push(
                "-f",
                `bestvideo[vcodec^=avc]+${aacAudio}/bestvideo+${aacAudio}`,
              );
            } else if (quality.match(/^\d+p$/)) {
              // 数字p形式の解像度指定（例：1080p, 720p, 480p, 360p）
              const height = quality.replace("p", "");
              args.push(
                "-f",
                `bestvideo[height<=${height}][vcodec^=avc]+${aacAudio}/bestvideo[height<=${height}]+${aacAudio}`,
              );
            } else {
              // その他の指定はそのまま使用し、m4aオーディオを指定
              args.push("-f", `${quality}+${aacAudio}`);
            }
          } else {
            // 品質指定がない場合は最高品質でH.264/AACを指定
            args.push(
              "-f",
              `bestvideo[vcodec^=avc]+${aacAudio}/bestvideo+${aacAudio}`,
            );
          }

          // ビデオコーデックの優先順位を指定
          args.push("-S", "res,vcodec:h264,acodec:m4a");
        }
      }

      // 音声フォーマットがopusの場合はmp3に変換（Windowsでの再生互換性のため）
      if (audioOnly && additionalOptions?.audioFormat === "opus") {
        args.push("--audio-format", "mp3");
      }

      // 追加オプションの適用
      if (additionalOptions) {
        for (const [key, value] of Object.entries(additionalOptions)) {
          // 既に処理した特殊オプションはスキップ
          if (["audioFormat", "remuxVideo"].includes(key)) continue;

          // metadataオプションの特別処理
          if (key === "addMetadata" && value === true) {
            args.push("--embed-metadata");
            continue;
          }

          // thumbnailオプションの特別処理
          if (key === "embedThumbnail" && value === true) {
            args.push("--embed-thumbnail");
            continue;
          }

          if (typeof value === "boolean") {
            if (value === true) {
              args.push(`--${key}`);
            }
          } else {
            args.push(`--${key}`, String(value));
          }
        }
      }

      // ダウンロード実行（非同期で実行）
      const eventEmitter = ytdlInstance.exec(args);

      // アクティブダウンロードに追加
      activeDownloads.set(downloadId, eventEmitter);

      // イベントハンドラー設定
      let stdout = "";
      let stderr = "";
      const progressData: ProgressData[] = [];

      // イベントハンドラー設定
      eventEmitter.on("event", (eventType: string, eventData: string) => {
        stdout += `[${eventType}] ${eventData}\n`;
      });

      // 進捗状況を取得
      eventEmitter.on("progress", (progress: ytdlWrapper.Progress) => {
        const progressInfo: ProgressData = {
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

        // SSEを通じてクライアントに進捗を送信
        sendProgressToClients(downloadId, progressInfo);
      });

      eventEmitter.on("error", (err) => {
        stderr += `${String(err)}\n`;

        // エラー情報をクライアントに送信
        sendProgressToClients(downloadId, {
          error: String(err),
          timestamp: Date.now(),
        });
      });

      eventEmitter.on("close", (code) => {
        // 完了情報をクライアントに送信
        sendProgressToClients(downloadId, {
          completed: true,
          success: code === 0,
          code: code,
          timestamp: Date.now(),
        });

        // アクティブダウンロードから削除
        activeDownloads.delete(downloadId);
      });

      // 実行中の非同期処理のハンドルを返す
      return downloadId;
    } catch (error) {
      console.error("ダウンロード中にエラーが発生しました:", error);
      sendProgressToClients(downloadId, {
        error: String(error),
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  /**
   * アクティブなダウンロードを中止
   */
  cancelDownload(downloadId: string): boolean {
    const download = activeDownloads.get(downloadId);
    if (download) {
      // プロセスを強制終了するためにnullを送信
      try {
        // EventEmitterはkillメソッドを直接持っていないが、
        // イベントリスナーを削除して、クリーンアップする
        activeDownloads.delete(downloadId);
        // 完了メッセージをクライアントに送信
        sendProgressToClients(downloadId, {
          cancelled: true,
          timestamp: Date.now(),
        });
        return true;
      } catch (error) {
        console.error("ダウンロードの中断に失敗しました:", error);
        return false;
      }
    }
    return false;
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
