import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { sanitizeForIpc } from "./ipcValue";

describe("插件房间资料跨进程传输", () => {
  it("保留沙箱队列和听过列表中的歌手姓名及编号", () => {
    const result = vm.runInNewContext(`(() => {
      const track = {
        id: '123', title: '测试歌曲',
        artists: [{ id: '1', name: '歌手甲' }, { id: '2', name: '歌手乙' }],
        album: { name: '测试专辑' }
      };
      return { data: { queue: [{ track }], played: [{ track }] } };
    })()`);
    const copied = structuredClone(sanitizeForIpc(result)) as typeof result;
    expect(copied.data.queue[0].track.artists).toEqual([
      { id: "1", name: "歌手甲" },
      { id: "2", name: "歌手乙" },
    ]);
    expect(copied.data.played[0].track.artists).toEqual(copied.data.queue[0].track.artists);
  });

  it("仍过滤不可克隆字段并限制循环引用的深度", () => {
    const value: Record<string, unknown> = { name: "资料", callback: () => {}, symbol: Symbol() };
    value.self = value;
    const copied = structuredClone(sanitizeForIpc(value)) as Record<string, unknown>;
    expect(copied.name).toBe("资料");
    expect(copied).not.toHaveProperty("callback");
    expect(copied).not.toHaveProperty("symbol");
    let cursor: unknown = copied;
    for (let i = 0; i < 17; i++) cursor = (cursor as Record<string, unknown>).self;
    expect(cursor).toBeNull();
  });
});
