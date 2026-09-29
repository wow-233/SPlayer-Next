import { expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";

const state = vi.hoisted(() => ({
  status: { playIndex: 0 },
  stop: vi.fn(),
  clear: vi.fn(),
  mediaClear: vi.fn(),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => state.status }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => ({ clear: state.mediaClear }) }));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ coverColor: "red" }) }));
vi.mock("@/core/player", () => ({ stop: state.stop, removeFromQueue: vi.fn() }));
vi.mock("@/stores/queue", () => ({ queue: ref([]), queueLength: ref(1), clearQueue: state.clear }));
vi.mock("@/services/listenTogether", () => ({
  togetherRoom: shallowRef({ inRoom: true, queue: [{ songId: "room-song" }] }),
  switchRoomTrack: vi.fn(),
}));

it("房间内即使旧清空确认框被提交，也不会停播或清除个人队列", async () => {
  const { useQueuePanel } = await import("./useQueuePanel");
  const panel = useQueuePanel({ listRef: shallowRef(null) });
  panel.clearConfirmOpen.value = true;
  panel.clearAll();
  expect(state.stop).not.toHaveBeenCalled();
  expect(state.clear).not.toHaveBeenCalled();
  expect(state.mediaClear).not.toHaveBeenCalled();
  expect(panel.clearConfirmOpen.value).toBe(false);
  expect(panel.queue.value[0].id).toBe("room-song");
});
