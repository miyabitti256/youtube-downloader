import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const BIN_DIR = "./bin";
const VERSION_FILE = join(BIN_DIR, "yt-dlp.version.json");
const GITHUB_API = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";

// OSごとのバイナリ名
const YTDLP_BINARIES: Record<string, string> = {
  win32: "yt-dlp.exe",
  linux: "yt-dlp_linux",
  darwin: "yt-dlp_macos",
};

function getYtDlpBinaryName(): string {
  return YTDLP_BINARIES[process.platform] || "yt-dlp";
}

function getYtDlpPath(): string {
  return resolve(BIN_DIR, getYtDlpBinaryName());
}

async function ensureBinDir() {
  if (!existsSync(BIN_DIR)) {
    await mkdir(BIN_DIR, { recursive: true });
  }
}

async function getLocalVersion(): Promise<string | null> {
  try {
    const data = await readFile(VERSION_FILE, "utf-8");
    return JSON.parse(data).tag_name;
  } catch {
    return null;
  }
}

async function saveLocalVersion(tag: string) {
  await writeFile(VERSION_FILE, JSON.stringify({ tag_name: tag }), "utf-8");
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

async function getLatestRelease(): Promise<GithubRelease> {
  const res = await fetch(GITHUB_API);
  if (!res.ok) throw new Error("Failed to fetch yt-dlp release info");
  return (await res.json()) as GithubRelease;
}

async function downloadYtDlp(url: string, path: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to download yt-dlp binary");
  const arrayBuffer = await res.arrayBuffer();
  await writeFile(path, Buffer.from(arrayBuffer), { mode: 0o755 }); // 実行権限付与
}

export const ytdlpBinaryService = {
  async setup() {
    await ensureBinDir();
    const localVersion = await getLocalVersion();
    const latest = await getLatestRelease();
    const latestTag = latest.tag_name;
    const binName = getYtDlpBinaryName();
    const binPath = getYtDlpPath();
    // assetsからOSに合ったバイナリを探す
    const asset = latest.assets.find((a) => a.name === binName);
    if (!asset) throw new Error(`${binName} not found in release assets`);
    if (localVersion !== latestTag || !existsSync(binPath)) {
      await downloadYtDlp(asset.browser_download_url, binPath);
      await saveLocalVersion(latestTag);
      console.log(`yt-dlpを${latestTag}に更新しました`);
    } else {
      console.log("yt-dlpは最新です");
    }
  },
  getYtDlpPath() {
    return getYtDlpPath();
  },
};
