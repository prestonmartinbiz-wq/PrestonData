import { Octokit } from "octokit";
import type { SaveMeta } from "@/lib/types";

const OWNER = process.env.GITHUB_OWNER || "prestonmartinbiz-wq";
const REPO = process.env.GITHUB_REPO || "PrestonData";
const BRANCH = "main";

export function hasGitHubToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: token });
}

export async function readGitHubFile(filePath: string): Promise<{
  content: string;
  sha: string;
  meta: SaveMeta;
}> {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    ref: BRANCH,
  });

  if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
    throw new Error(`Expected file at ${filePath}`);
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return {
    content,
    sha: data.sha,
    meta: {
      source: "github",
      path: filePath,
      sha: data.sha,
      htmlUrl: data.html_url || undefined,
    },
  };
}

export async function writeGitHubFile(
  filePath: string,
  content: string,
  message: string,
  sha?: string
): Promise<SaveMeta> {
  const octokit = getOctokit();
  let currentSha = sha;
  if (!currentSha) {
    try {
      const existing = await readGitHubFile(filePath);
      currentSha = existing.sha;
    } catch {
      currentSha = undefined;
    }
  }

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: BRANCH,
    sha: currentSha,
  });

  return {
    source: "github",
    path: filePath,
    sha: data.content?.sha,
    lastSavedAt: new Date().toISOString(),
    htmlUrl: data.content?.html_url || undefined,
  };
}
