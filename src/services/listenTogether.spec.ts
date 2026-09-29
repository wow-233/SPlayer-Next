import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/composables/useToast", () => ({ toast: { error: vi.fn() } }));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.resetModules();
});

it("退出房间后忽略先前推歌返回的旧快照", async () => {
  const request = deferred<unknown>();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      plugins: {
        invokeMenu: vi.fn(({ menuId }) =>
          menuId === "together-push"
            ? request.promise
            : Promise.resolve({ ok: true, data: { inRoom: false } }),
        ),
      },
    },
  });
  const room = await import("./listenTogether");
  const pushing = room.invokeTogether("together-push");
  const rejected = expect(pushing).rejects.toThrow("房间已切换");
  await room.invokeTogether("together-leave");
  request.resolve({ ok: true, data: { inRoom: true, roomId: "old" } });
  await rejected;
  expect(room.togetherRoom.value.inRoom).toBe(false);
});

it("操作成功后，旧状态请求失败不能重新显示错误", async () => {
  const request = deferred<unknown>();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      plugins: {
        invokeMenu: vi.fn(({ menuId }) =>
          menuId === "together-status"
            ? request.promise
            : Promise.resolve({ ok: true, data: { inRoom: true, roomId: "new" } }),
        ),
      },
    },
  });
  const room = await import("./listenTogether");
  const refreshing = room.refreshTogetherRoom();
  await room.invokeTogether("together-create");
  request.reject(new Error("过期错误"));
  await refreshing;
  expect(room.roomError.value).toBe("");
  expect(room.togetherRoom.value.roomId).toBe("new");
});
