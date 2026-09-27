export const parseSecurityToken = (body: string): string => {
  const match = body.match(/\[\s*\d+\s*,\s*\d+\s*,\s*"(?:[^"\\]|\\.)*"\s*\]/);
  if (!match) throw new Error("网易云房间校验 token 响应无效");
  try {
    const [code, , token] = JSON.parse(match[0]) as [number, number, unknown];
    if (code === 200 && typeof token === "string" && token.length >= 8) return token;
  } catch {
    // 服务端返回非 JSON 数据时由统一错误提示处理。
  }
  throw new Error("网易云房间校验 token 响应无效");
};
