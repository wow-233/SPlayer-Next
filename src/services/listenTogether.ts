/** 官方多人一起听的共享房间状态。播放器和房间页都从这里读取。 */
import { shallowRef, toRaw } from "vue";
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

/** 创建退出房间后的空快照 */
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

/**
 * 计算房间快照指纹：所有会影响 UI 的字段都参与比较，
 * 轮询无变化时不替换引用，避免全量触发响应式更新。
 * @param data - 归一化后的房间快照
 * @returns 稳定的状态指纹字符串
 */
const roomFingerprint = (data: TogetherRoom): string => {
  const memberKey = data.members.map((m) => m.userId).join(",");
  const queueKey = data.queue
    .map((s) => `${s.songId}:${s.songBizId ?? ""}:${s.pinCount ?? 0}:${s.pinned ? 1 : 0}`)
    .join(",");
  const playedKey = data.played.map((s) => s.songId).join(",");
  return [
    data.inRoom ? 1 : 0,
    data.roomId,
    data.inviterId,
    data.currentSongId,
    data.memberCount,
    data.paused ? 1 : 0,
    data.syncError,
    memberKey,
    queueKey,
    playedKey,
  ].join("|");
};

/**
 * 应用插件返回的房间快照；与当前状态一致时保持原引用
 * @param value - 插件房间状态
 */
const applyRoom = (value: unknown): void => {
  if (!value || typeof value !== "object" || !("inRoom" in value)) return;
  const data = value as Partial<TogetherRoom>;
  const next: TogetherRoom = {
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
  // lastSyncedAt 是时间戳不参与 UI；指纹一致则保留原引用，跳过响应式更新
  if (roomFingerprint(togetherRoom.value) === roomFingerprint(next)) {
    return;
  }
  togetherRoom.value = next;
  roomError.value = next.syncError;
};

/** 读取房间状态，丢弃操作完成前发出的旧查询 */
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

/** 启动房间状态轮询 */
export const startTogetherRoom = (): void => {
  if (pollHandle) return;
  void refreshTogetherRoom();
  pollHandle = setInterval(() => void refreshTogetherRoom(), 2000);
};

/** 停止轮询，并使未完成的请求失效 */
export const stopTogetherRoom = (): void => {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = undefined;
  roomSession += 1;
  roomRevision += 1;
};

/**
 * 执行房间操作，隔离已退出房间的迟到响应
 * @param menuId - 插件动作标识
 * @param track - 操作对应的曲目
 * @param data - 操作的附加参数
 * @returns 插件执行结果
 */
export const invokeTogether = async (menuId: string, track?: Track, data?: unknown) => {
  if (["together-create", "together-join", "together-leave", "together-resume"].includes(menuId)) {
    roomSession += 1;
    roomRevision += 1;
  }
  const session = roomSession;
  const result = await window.api.plugins.invokeMenu({
    pluginId: TOGETHER_PLUGIN_ID,
    menuId,
    track: track ? toRaw(track) : undefined,
    data,
  });
  if (session !== roomSession) throw new Error("房间已切换，此次操作已结束");
  if (!result.ok) throw new Error(result.error || "房间操作失败");
  roomRevision += 1;
  roomError.value = "";
  applyRoom(result.data);
  return result;
};

/**
 * 先确认官方房间切歌，再由插件加载曲目
 * @param track - 目标网易云曲目
 * @returns 是否已由房间接管此次播放
 */
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

/** 恢复声音前先追上房间当前进度 */
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

/** 手动请求下一首，返回是否由房间接管 */
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

/**
 * 顺序推歌，退出或切换房间后停止剩余操作
 * @param tracks - 待推送曲目
 */
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
