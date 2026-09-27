/** 每次房间操作从网易云易盾获取新鲜校验 token。 */
import { fetchWithProxy } from "@main/utils/proxy";
import type { NeteaseModule } from "../core/types";
import { parseSecurityToken } from "./listentogether_token_parser";

const listentogether_security_token: NeteaseModule = async () => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithProxy("https://ac.dun.163yun.com/v3/b?pn=YD00000558929251", {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`网易云房间校验 token 请求失败：${response.status}`);
      const token = parseSecurityToken(await response.text());
      return { status: 200, body: { code: 200, token }, cookie: [] };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("网易云房间校验暂不可用，请稍后重试");
};

export default listentogether_security_token;
