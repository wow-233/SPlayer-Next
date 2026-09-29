/**
 * 深度剥离不可克隆字段
 * 保留 string/number/bool/null/Uint8Array/纯字典/数组；丢函数/symbol；
 * Buffer 转 Uint8Array、普通对象用 Object.create(null) 重建以脱掉 vm.Context 原型链
 * @param value - 任意值
 * 房间结果包含 data → queue → track → artists → artist，需保留完整嵌套资料。
 * @param depth - 当前递归深度，最多保留 16 层
 */
export const sanitizeForIpc = (value: unknown, depth = 0): unknown => {
  if (depth > 16) return null;
  if (value == null) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === "bigint") return value;
  if (t === "function" || t === "symbol") return undefined;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForIpc(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (t === "object") {
    const out: Record<string, unknown> = Object.create(null);
    try {
      for (const key of Object.keys(value as object)) {
        const cleaned = sanitizeForIpc((value as Record<string, unknown>)[key], depth + 1);
        if (cleaned !== undefined) out[key] = cleaned;
      }
    } catch {
      // Proxy 的 ownKeys 可能抛，直接返回空字典
    }
    return out;
  }
  return undefined;
};
