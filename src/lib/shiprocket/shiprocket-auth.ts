/**
 * Shiprocket authentication - fetch and cache token
 */

let cachedToken: string | null = null;
let tokenExpiry: number = 0;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // 9 days (Shiprocket tokens last 10 days)

function getConfig() {
  const apiUrl = process.env.SHIPROCKET_API_URL ?? "https://apiv2.shiprocket.in/v1/external";
  const email = process.env.SHIPROCKET_API_EMAIL ?? "";
  const password = process.env.SHIPROCKET_API_PASSWORD ?? "";
  return { apiUrl, email, password };
}

export function clearShiprocketTokenCache(): void {
  cachedToken = null;
  tokenExpiry = 0;
}

export async function getShiprocketToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const { apiUrl, email, password } = getConfig();
  if (!email || !password) {
    throw new Error("SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD must be set");
  }

  const response = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Authentication failed" }));
    throw new Error((errorData as { message?: string }).message ?? `Authentication failed: ${response.status}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("No token received from Shiprocket");
  }

  cachedToken = data.token;
  tokenExpiry = Date.now() + TOKEN_TTL_MS;
  return data.token;
}
