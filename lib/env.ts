export function clerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const sk = process.env.CLERK_SECRET_KEY || "";
  return Boolean(pk && sk && !pk.includes("xxxxxxxx") && !pk.includes("placeholder"));
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
