export function clerkConfigured(): boolean {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const sk = process.env.CLERK_SECRET_KEY || "";
  return Boolean(pk && sk && !pk.includes("xxxxxxxx") && !pk.includes("placeholder"));
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}
