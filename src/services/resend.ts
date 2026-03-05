export async function validateApiKey(apiKey: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return res.ok;
}
