/** 官方多人一起听的共享房间状态。播放器和房间页都从这里读取。 */
import { shallowRef } from "vue";
import type { Track } from "@shared/types/player";
import { toast } from "@/composables/useToast";

export const TOGETHER_PLUGIN_ID = "splayer.netease-together";

export interface RoomSong {
  songId: string;
  songBizId?: string;
  pinned?: boolean;
  track?: Track;
  recommendedBy?: string;
  pinCount?: number;
}

export interface TogetherRoom {
  inRoom: boolean;
  roomId: string | null;
  inviterId: string | null;
  currentSongId: string | null;
  memberCount: number;
  members: Array<{ userId: string; nickname: string; avatarUrl?: string }>;
  paused: boolean;
  syncError: string;
  lastSyncedAt: number;
  queue: RoomSong[];
  played: RoomSong[];
}

const emptyRoom = (): TogetherRoom => ({
  inRoom: false,
  roomId: null,
  inviterId: null,
  currentSongId: null,
  memberCount: 1,
  members: [],
  paused: false,
  syncError: "",
  lastSyncedAt: 0,
  queue: [],
  played: [],
});

export const togetherRoom = shallowRef<TogetherRoom>(emptyRoom());
export const roomError = shallowRef("");
let pollHandle: ReturnType<typeof setInterval> | undefined;
let refreshing = false;
let switching = false;
let roomRevision = 0;
let roomSession = 0;

const applyRoom = (value: unknown): void => {
  if (!value || typeof value !== "object" || !("inRoom" in value)) return;
  const data = value as Partial<TogetherRoom>;
  togetherRoom.value = {
    inRoom: !!data.inRoom,
    roomId: data.roomId ? String(data.roomId) : null,
    inviterId: data.inviterId ? String(data.inviterId) : null,
    currentSongId: data.currentSongId ? String(data.currentSongId) : null,
    memberCount: Math.max(1, Number(data.memberCount) || 1),
    members: Array.isArray(data.members) ? data.members : [],
    paused: !!data.paused,
    syncError: data.syncError || "",
    lastSyncedAt: data.lastSyncedAt || 0,
    queue: Array.isArray(data.queue) ? data.queue : [],
    played: Array.isArray(data.played) ? data.played : [],
  };
};

export const refreshTogetherRoom = async (): Promise<void> => {
  if (refreshing) return;
  refreshing = true;
  const revision = roomRevision;
  try {
    const result = await window.api.plugins.invokeMenu({
      pluginId: TOGETHER_PLUGIN_ID,
      menuId: "together-status",
    });
    if (revision !== roomRevision) return;
    if (result.ok) {
      roomError.value = "";
      applyRoom(result.data);
    } else {
      roomError.value = result.error || "一起听插件未就绪";
    }
  } catch (error) {
    if (revision !== roomRevision) return;
    roomError.value = error instanceof Error ? error.message : "一起听插件未就绪";
  } finally {
    refreshing = false;
  }
};

export const startTogetherRoom = (): void => {
  if (pollHandle) return;
  void refreshTogetherRoom();
  pollHandle = setInterval(() => void refreshTogetherRoom(), 3000);
};

export const stopTogetherRoom = (): void => {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = undefined;
};

export const invokeTogether = async (menuId: string, track?: Track, data?: unknown) => {
  if (["together-create", "together-join", "together-leave", "together-resume"].includes(menuId)) {
    roomSession += 1;
    roomRevision += 1;
  }
  const session = roomSession;
  const result = await window.api.plugins.invokeMenu({
    pluginId: TOGETHER_PLUGIN_ID,
    menuId,
    track: track ? { ...track } : undefined,
    data,
  });
  if (session !== roomSession) throw new Error("房间已切换，此次操作已结束");
  if (!result.ok) throw new Error(result.error || "房间操作失败");
  roomRevision += 1;
  roomError.value = "";
  applyRoom(result.data);
  return result;
};

/** 本地切歌必须先得到官方房间的操作确认，再由插件加载歌曲。 */
export const switchRoomTrack = async (track: Track): Promise<boolean> => {
  if (!togetherRoom.value.inRoom) return false;
  if (switching) return true;
  if (track.source !== "netease") {
    toast.error("一起听房间只支持网易云在线歌曲；退出房间后可播放此歌曲");
    return true;
  }
  if (String(track.id) === togetherRoom.value.currentSongId) {
    await resumeRoomPlayback();
    return true;
  }
  switching = true;
  try {
    await invokeTogether("together-goto", track);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "房间切歌失败");
  } finally {
    switching = false;
  }
  return true;
};

export const resumeRoomPlayback = async (): Promise<void> => {
  if (switching || !togetherRoom.value.inRoom) return;
  switching = true;
  try {
    await invokeTogether("together-play");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "恢复房间播放失败");
  } finally {
    switching = false;
  }
};

export const nextRoomTrack = async (): Promise<boolean> => {
  if (!togetherRoom.value.inRoom) return false;
  if (switching) return true;
  switching = true;
  try {
    await invokeTogether("together-next");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "房间切歌失败");
  } finally {
    switching = false;
  }
  return true;
};

/** 自然播完由官方房间决定下一首，不能替全房间发送主动切歌。 */
export const roomTrackEnded = async (): Promise<void> => {
  if (!togetherRoom.value.inRoom) return;
  try {
    await invokeTogether("together-ended");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "等待房间下一首失败");
  }
};

/** 本机解码或音源失败不能跳过其他人推荐的歌曲。 */
export const roomPlaybackFailed = async (): Promise<void> => {
  if (!togetherRoom.value.inRoom) return;
  try {
    await invokeTogether("together-retry");
  } catch (error) {
    roomError.value = error instanceof Error ? error.message : "房间播放恢复失败";
  }
};

export const pushRoomTracks = async (tracks: readonly Track[]): Promise<void> => {
  if (!togetherRoom.value.inRoom) return;
  const session = roomSession;
  for (const track of tracks) {
    if (session !== roomSession || !togetherRoom.value.inRoom) return;
    if (track.source !== "netease") {
      toast.error("房间只能添加网易云在线歌曲");
      continue;
    }
    try {
      await invokeTogether("together-push", track);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推歌失败");
    }
  }
};
