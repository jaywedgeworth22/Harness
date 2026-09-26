/**
 * MiniMax Harness HTTP constants.
 *
 * Shellular MiniMax uses the dsh coding path (`bridges/mmh/mmh-acp.py` →
 * `dsh --profile mmh-headless`).  These constants remain for direct HTTP
 * callers and BotFleet/AFC imports that need the host, path, and default
 * model without duplicating strings.
 */

export const MMH_DEFAULT_BASE_URL = "https://api.minimax.io/v1";
export const MMH_CHAT_COMPLETIONS_PATH = "/chat/completions";
export const MMH_DEFAULT_MODEL = "MiniMax-M2.7-highspeed";
export const MMH_API_KEY_ENV = "MINIMAX_API_KEY";
export const MMH_API_KEY_NAME_ENV = "MMH_API_KEY_NAME";

export function mmhNormalizeBaseUrl(baseUrl: string = MMH_DEFAULT_BASE_URL): string {
  return baseUrl.replace(/\/+$/u, "");
}

export function mmhChatCompletionsUrl(baseUrl: string = MMH_DEFAULT_BASE_URL): string {
  return `${mmhNormalizeBaseUrl(baseUrl)}${MMH_CHAT_COMPLETIONS_PATH}`;
}

/** Env contract the Python bridge and any TS caller share. */
export function mmhTransformEnv(env: Record<string, string | undefined>): void {
  if (!env.MMH_BASE_URL) env.MMH_BASE_URL = MMH_DEFAULT_BASE_URL;
  if (!env.MMH_MODEL) env.MMH_MODEL = MMH_DEFAULT_MODEL;
  if (!env.MMH_API_KEY_NAME) env.MMH_API_KEY_NAME = MMH_API_KEY_ENV;
}

export function mmhIsAuthenticated(env: Record<string, string | undefined>): boolean {
  const name = env.MMH_API_KEY_NAME || MMH_API_KEY_ENV;
  return Boolean(env[name] || env.MINIMAX_API_KEY);
}
