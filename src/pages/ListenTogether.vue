<script setup lang="ts">
defineOptions({ name: "ListenTogether" });

import type { Track } from "@shared/types/player";
import { searchSongs } from "@/apis/search";
import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import { useCopyText } from "@/composables/useCopyText";
import { toast } from "@/composables/useToast";
import {
  togetherRoom,
  roomError,
  refreshTogetherRoom,
  invokeTogether,
  type RoomSong,
} from "@/services/listenTogether";

const media = useMediaStore();
const status = useStatusStore();
const { copy } = useCopyText();
const roomLink = ref("");
const keyword = ref("");
const results = shallowRef<Track[]>([]);
const searching = ref(false);
const busy = ref("");
const activeTab = ref<"upcoming" | "played">("upcoming");
const searchInput = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSequence = 0;

const current = computed(() =>
  togetherRoom.value.queue.find((song) => song.songId === togetherRoom.value.currentSongId),
);
const currentTrack = computed(() => {
  const roomTrack = current.value?.track;
  if (roomTrack) return roomTrack;
  const local = media.track;
  return local?.source === "netease" && local.id === togetherRoom.value.currentSongId
    ? local
    : null;
});
const upcoming = computed(() =>
  togetherRoom.value.queue.filter((song) => song.songId !== togetherRoom.value.currentSongId),
);
const queuedIds = computed(() => new Set(togetherRoom.value.queue.map((song) => song.songId)));
const inviteLink = computed(() => {
  const room = togetherRoom.value;
  if (!room.roomId || !room.inviterId) return "";
  const params = new URLSearchParams({ roomId: room.roomId, inviterUid: room.inviterId });
  if (room.currentSongId) params.set("songId", room.currentSongId);
  return `https://st.music.163.com/listen-together/multishare/index.html?${params}`;
});
const artistNames = (track?: Track | null): string =>
  track?.artists.map((artist) => artist.name).join(" / ") || "未知歌手";
const songTitle = (song: RoomSong): string => song.track?.title || `歌曲 ${song.songId}`;
const recommender = (song: RoomSong): string =>
  togetherRoom.value.members.find((user) => user.userId === song.recommendedBy)?.nickname ||
  `用户 ${song.recommendedBy}`;
const localMatchesRoom = computed(() => media.track?.id === togetherRoom.value.currentSongId);
const lyricPreview = computed(() => {
  if (!localMatchesRoom.value || !media.parsedLyric.length) return [];
  const index = Math.max(0, media.lyricIndex);
  return media.parsedLyric.slice(Math.max(0, index - 2), index + 4).map((line, offset) => ({
    key: `${line.startTime}-${offset}`,
    text: line.words.map((word) => word.word).join(""),
    translation: line.translatedLyric,
    active: Math.max(0, index - 2) + offset === index,
  }));
});
const progress = computed(() =>
  status.duration > 0 ? Math.min(100, (status.position / status.duration) * 100) : 0,
);
const clock = (ms: number): string => {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
};

const run = async (name: string, menuId: string, track?: Track, data?: unknown): Promise<void> => {
  if (busy.value) return;
  busy.value = name;
  try {
    const result = await invokeTogether(menuId, track, data);
    if (result.copyText) await copy(result.copyText);
    else if (result.toast) toast.success(result.toast);
    await refreshTogetherRoom();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "房间操作失败");
  } finally {
    busy.value = "";
  }
};

const createRoom = async (): Promise<void> => {
  const track = media.track;
  await run("create", "together-create", track?.source === "netease" ? toRaw(track) : undefined);
};

const joinRoom = async (): Promise<void> => {
  const link = roomLink.value.trim();
  if (!link) {
    toast.error("请先粘贴网易云多人一起听邀请链接");
    return;
  }
  await run("join", "together-join", undefined, { roomLink: link });
};

const pasteLink = async (): Promise<void> => {
  try {
    roomLink.value = (await navigator.clipboard.readText()).trim();
  } catch {
    toast.error("无法读取剪贴板");
  }
};

const search = async (): Promise<void> => {
  if (searchTimer) clearTimeout(searchTimer);
  const query = keyword.value.trim();
  const request = ++searchSequence;
  if (!query) {
    results.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  try {
    const found = (await searchSongs("netease", query, 0, 30)).items;
    if (request === searchSequence) results.value = found;
  } catch (error) {
    if (request === searchSequence)
      toast.error(error instanceof Error ? error.message : "搜索失败");
  } finally {
    if (request === searchSequence) searching.value = false;
  }
};

const scheduleSearch = (): void => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!keyword.value.trim()) {
    searchSequence += 1;
    results.value = [];
    searching.value = false;
    return;
  }
  searchTimer = setTimeout(() => void search(), 280);
};

const focusPush = async (): Promise<void> => {
  activeTab.value = "upcoming";
  await nextTick();
  searchInput.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  searchInput.value?.focus({ preventScroll: true });
};

const roomTrack = (song: RoomSong): Track =>
  song.track ?? {
    id: song.songId,
    source: "netease",
    title: songTitle(song),
    artists: [],
    duration: 0,
  };

onMounted(() => void refreshTogetherRoom());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  searchSequence += 1;
});
</script>

<template>
  <div class="room-shell mx-auto w-full max-w-7xl px-6 pb-12 pt-8 md:px-10">
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="mb-2 text-sm font-medium text-primary">网易云官方房间</div>
        <h1 class="text-3xl font-bold">多人一起听</h1>
        <p class="mt-2 text-sm text-on-surface-variant">
          {{
            togetherRoom.inRoom
              ? `${togetherRoom.memberCount} 人在线 · 房间 ${togetherRoom.roomId}`
              : "和好友一起听，推歌会进入同一个房间队列"
          }}
        </p>
      </div>
      <div v-if="togetherRoom.inRoom" class="flex gap-2">
        <button class="room-button room-button-primary" @click="focusPush">＋ 推歌</button>
        <button class="room-button" @click="copy(inviteLink)">复制邀请链接</button>
        <button class="room-button" :disabled="!!busy" @click="run('leave', 'together-leave')">
          退出房间
        </button>
      </div>
    </div>

    <div v-if="roomError" class="mb-5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
      {{ roomError }}
    </div>

    <template v-if="!togetherRoom.inRoom">
      <div class="grid gap-5 md:grid-cols-2">
        <section class="room-panel">
          <h2 class="text-lg font-semibold">创建房间</h2>
          <p class="mt-2 text-sm text-on-surface-variant">
            已有官方房间会先恢复；否则以当前网易云歌曲创建。
          </p>
          <div class="mt-5 rounded-xl bg-primary/5 p-4">
            <div class="font-medium">{{ media.track?.title || "还没有播放歌曲" }}</div>
            <div class="mt-1 text-sm text-on-surface-variant">{{ artistNames(media.track) }}</div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <button class="room-button room-button-primary" :disabled="!!busy" @click="createRoom">
              创建或恢复房间
            </button>
            <button
              class="room-button"
              :disabled="!!busy"
              @click="run('resume', 'together-resume')"
            >
              恢复已有房间
            </button>
          </div>
        </section>
        <section class="room-panel">
          <h2 class="text-lg font-semibold">加入好友房间</h2>
          <p class="mt-2 text-sm text-on-surface-variant">粘贴网易云手机端“多人一起听”邀请链接。</p>
          <textarea
            v-model="roomLink"
            class="room-input mt-5 min-h-24 resize-none"
            placeholder="https://st.music.163.com/listen-together/multishare/…"
          />
          <div class="mt-3 flex gap-2">
            <button class="room-button" @click="pasteLink">粘贴链接</button>
            <button class="room-button room-button-primary" :disabled="!!busy" @click="joinRoom">
              加入房间
            </button>
          </div>
        </section>
      </div>
    </template>

    <template v-else>
      <section class="room-panel room-hero mb-5">
        <div class="room-record-column">
          <div class="room-record">
            <img
              v-if="currentTrack?.cover"
              :src="currentTrack.cover"
              class="room-record-cover"
              alt="当前歌曲封面"
            />
            <span v-else class="room-record-placeholder">♫</span>
          </div>
          <div class="room-track-info">
            <div class="room-eyebrow">{{ togetherRoom.paused ? "房间已暂停" : "正在一起听" }}</div>
            <h2>{{ currentTrack?.title || "等待房间播放歌曲" }}</h2>
            <p>{{ artistNames(currentTrack) }}</p>
            <p v-if="current?.recommendedBy" class="room-recommender">
              由 {{ recommender(current) }} 推荐
            </p>
          </div>
          <div v-if="localMatchesRoom" class="room-progress" title="进度由官方房间统一同步">
            <div class="room-progress-track"><div :style="{ width: `${progress}%` }" /></div>
            <div class="room-progress-time">
              <span>{{ clock(status.position) }}</span>
              <span>房间同步 · 不可拖动</span>
              <span>{{ clock(status.duration) }}</span>
            </div>
          </div>
        </div>
        <div class="room-lyrics">
          <div class="room-lyrics-header">
            <span>歌词</span>
            <button class="room-text-button" @click="status.isPlayerExpanded = true">
              查看完整歌词
            </button>
          </div>
          <div v-if="lyricPreview.length" class="room-lyrics-lines">
            <div
              v-for="line in lyricPreview"
              :key="line.key"
              class="room-lyric-line"
              :class="{ active: line.active }"
            >
              <div>{{ line.text }}</div>
              <div v-if="line.translation" class="room-lyric-translation">
                {{ line.translation }}
              </div>
            </div>
          </div>
          <p v-else class="room-lyrics-empty">房间歌曲的歌词会显示在这里</p>
        </div>
      </section>

      <div
        v-if="togetherRoom.members.length"
        class="mb-5 flex flex-wrap items-center gap-2 text-sm"
      >
        <span class="mr-1 text-on-surface-variant">房间成员</span>
        <span
          v-for="member in togetherRoom.members"
          :key="member.userId"
          class="room-member inline-flex items-center gap-1.5 px-2 py-1"
        >
          <img
            v-if="member.avatarUrl"
            :src="member.avatarUrl"
            class="size-5 rounded-full object-cover"
            alt=""
          />
          {{ member.nickname }}
        </span>
      </div>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section class="room-panel min-w-0">
          <div class="mb-5 flex items-center gap-4 border-b border-primary/10 pb-3">
            <button
              :class="
                activeTab === 'upcoming' ? 'text-primary font-semibold' : 'text-on-surface-variant'
              "
              @click="activeTab = 'upcoming'"
            >
              待播 {{ upcoming.length }}
            </button>
            <button
              :class="
                activeTab === 'played' ? 'text-primary font-semibold' : 'text-on-surface-variant'
              "
              @click="activeTab = 'played'"
            >
              听过 {{ togetherRoom.played.length }}
            </button>
          </div>
          <div
            v-if="activeTab === 'upcoming' && !upcoming.length"
            class="py-10 text-center text-sm text-on-surface-variant"
          >
            房间还没有待播歌曲
            <button class="room-text-button" @click="focusPush">去推歌</button>
          </div>
          <div
            v-if="activeTab === 'played' && !togetherRoom.played.length"
            class="py-10 text-center text-sm text-on-surface-variant"
          >
            进入房间后播放过的歌会显示在这里
          </div>
          <div
            v-for="(song, index) in activeTab === 'upcoming' ? upcoming : togetherRoom.played"
            :key="`${activeTab}-${index}-${song.songId}`"
            class="flex items-center gap-3 border-b border-primary/5 py-3 last:border-0"
          >
            <span class="w-6 shrink-0 text-center text-sm text-on-surface-variant">
              {{ index + 1 }}
            </span>
            <img
              v-if="song.track?.cover"
              :src="song.track.cover"
              class="size-11 rounded-lg object-cover"
              alt=""
            />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ songTitle(song) }}</div>
              <div class="truncate text-xs text-on-surface-variant">
                {{ artistNames(song.track) }}
              </div>
              <div v-if="song.recommendedBy" class="truncate text-xs text-primary/70">
                {{ recommender(song) }} 推荐
              </div>
            </div>
            <template v-if="activeTab === 'upcoming'">
              <button
                class="room-pin-button"
                :disabled="!!busy"
                :title="
                  song.pinCount === undefined ? '置顶次数暂不可用' : `${song.pinCount} 人置顶`
                "
                @click="run('pin', 'together-pin', roomTrack(song))"
              >
                ↑
                <span>{{ song.pinCount ?? "—" }}</span>
              </button>
              <button
                class="room-text-button"
                :disabled="!!busy"
                @click="run('goto', 'together-goto', roomTrack(song))"
              >
                播放
              </button>
            </template>
            <template v-else>
              <button
                class="room-text-button"
                :disabled="!!busy || queuedIds.has(song.songId)"
                @click="run('push', 'together-push', roomTrack(song))"
              >
                {{ queuedIds.has(song.songId) ? "已在房间" : "加入待播" }}
              </button>
              <button
                class="room-text-button"
                :disabled="!!busy"
                @click="run('goto', 'together-goto', roomTrack(song))"
              >
                重播
              </button>
            </template>
          </div>
        </section>

        <section class="room-panel min-w-0">
          <h2 class="text-lg font-semibold">推歌到房间</h2>
          <p class="mt-1 text-sm text-on-surface-variant">
            推荐的歌曲会出现在所有人的待播列表。播放由房间统一控制。
          </p>
          <div class="mt-4 flex gap-2">
            <input
              ref="searchInput"
              v-model="keyword"
              class="room-input min-w-0 flex-1"
              placeholder="输入歌名或歌手，自动搜索"
              @input="scheduleSearch"
              @keyup.enter="search"
            />
            <button
              v-if="keyword"
              class="room-button"
              title="清空搜索"
              @click="
                keyword = '';
                scheduleSearch();
                searchInput?.focus();
              "
            >
              清空
            </button>
          </div>
          <div class="room-search-hint">
            {{
              searching
                ? "正在搜索…"
                : keyword.trim()
                  ? `找到 ${results.length} 首 · 点击推歌加入待播`
                  : "搜索后可连续推歌，无需重复打开页面"
            }}
          </div>
          <div class="mt-4 max-h-[34rem] overflow-y-auto">
            <div
              v-for="track in results"
              :key="track.id"
              class="flex items-center gap-3 border-b border-primary/5 py-3 last:border-0"
            >
              <img
                v-if="track.cover"
                :src="track.cover"
                class="size-10 rounded-lg object-cover"
                alt=""
              />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{{ track.title }}</div>
                <div class="truncate text-xs text-on-surface-variant">{{ artistNames(track) }}</div>
              </div>
              <button
                class="room-text-button"
                :disabled="!!busy || queuedIds.has(String(track.id))"
                @click="run('push', 'together-push', track)"
              >
                {{ queuedIds.has(String(track.id)) ? "已在房间" : "＋ 推歌" }}
              </button>
              <button
                class="room-text-button"
                :disabled="!!busy"
                title="立即切换整个房间正在播放的歌曲"
                @click="run('goto', 'together-goto', track)"
              >
                立即播放
              </button>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.room-shell {
  color: #eef7f2;
  min-height: 100%;
  background: linear-gradient(
    145deg,
    rgba(8, 32, 33, 0.91),
    rgba(14, 35, 39, 0.87) 52%,
    rgba(9, 24, 28, 0.93)
  );
  border-radius: 24px;
  box-shadow: 0 22px 80px rgba(0, 0, 0, 0.23);
}
.room-shell .text-on-surface-variant {
  color: #aebfc0;
}
.room-shell .text-primary {
  color: #9fe9cb;
}
.room-panel {
  border-radius: 20px;
  border: 1px solid rgba(190, 235, 219, 0.16);
  background: rgba(8, 28, 31, 0.66);
  padding: 24px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.12);
}
.room-button,
.room-text-button {
  font: inherit;
  cursor: pointer;
  transition:
    background 0.18s,
    transform 0.18s,
    opacity 0.18s;
}
.room-button {
  border: 1px solid rgba(184, 238, 218, 0.25);
  border-radius: 12px;
  background: rgba(214, 251, 237, 0.12);
  color: #f2fff8;
  padding: 9px 15px;
  font-size: 14px;
  font-weight: 600;
}
.room-button:hover {
  background: rgba(214, 251, 237, 0.22);
}
.room-button-primary {
  border-color: #9deac7;
  background: #a6edca;
  color: #0c302b;
}
.room-button-primary:hover {
  background: #c3f9dd;
}
.room-button:disabled,
.room-text-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.room-text-button {
  flex-shrink: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  padding: 6px 10px;
  color: #a9eccd;
  font-size: 14px;
  font-weight: 600;
}
.room-text-button:hover {
  background: rgba(169, 236, 205, 0.14);
}
.room-pin-button {
  flex-shrink: 0;
  min-width: 58px;
  border: 1px solid rgba(169, 236, 205, 0.25);
  border-radius: 10px;
  background: rgba(169, 236, 205, 0.08);
  color: #b6f5d6;
  padding: 6px 10px;
  font: inherit;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.room-pin-button:hover {
  background: rgba(169, 236, 205, 0.18);
}
.room-pin-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
.room-input {
  display: block;
  width: 100%;
  border: 1px solid rgba(185, 231, 218, 0.3);
  border-radius: 12px;
  background: rgba(3, 19, 22, 0.72);
  padding: 11px 13px;
  color: #f2fff8;
  font-size: 14px;
  outline: none;
}
.room-input::placeholder {
  color: #9baeb1;
}
.room-input:focus {
  border-color: #a6edca;
  box-shadow: 0 0 0 3px rgba(166, 237, 202, 0.15);
}
.room-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 38px;
  min-height: 430px;
  background: linear-gradient(125deg, rgba(24, 67, 62, 0.85), rgba(9, 34, 37, 0.8));
}
.room-record-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.room-record {
  width: min(250px, 66vw);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: repeating-radial-gradient(circle at center, #181c1b 0 4px, #222927 5px 8px);
  border: 9px solid #222a28;
  box-shadow:
    0 0 0 8px rgba(222, 255, 238, 0.06),
    0 18px 35px rgba(0, 0, 0, 0.38);
}
.room-record-cover {
  width: 58%;
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
}
.room-record-placeholder {
  color: #a6edca;
  font-size: 72px;
}
.room-track-info {
  width: 100%;
  text-align: center;
  margin-top: 28px;
}
.room-eyebrow {
  color: #a8e9c9;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.room-track-info h2 {
  margin: 8px 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 25px;
  font-weight: 700;
}
.room-track-info p {
  margin: 0;
  color: #b8ccc8;
}
.room-track-info .room-recommender {
  margin-top: 6px;
  font-size: 12px;
}
.room-progress {
  width: 100%;
  max-width: 440px;
  margin-top: 26px;
}
.room-progress-track {
  height: 4px;
  border-radius: 5px;
  overflow: hidden;
  background: rgba(210, 238, 223, 0.18);
}
.room-progress-track > div {
  height: 100%;
  background: #c6f4d7;
}
.room-progress-time {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  color: #aebfc0;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.room-lyrics {
  min-width: 0;
  padding: 12px 0 12px 26px;
  border-left: 1px solid rgba(200, 240, 221, 0.16);
}
.room-lyrics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
  font-weight: 700;
}
.room-lyrics-lines {
  max-height: 395px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent, black 14%, black 84%, transparent);
}
.room-lyric-line {
  margin: 0 0 20px;
  color: #adc3be;
  font-size: 18px;
  line-height: 1.45;
}
.room-lyric-line.active {
  color: #f0fff3;
  font-size: 22px;
  font-weight: 700;
}
.room-lyric-translation {
  margin-top: 3px;
  font-size: 0.82em;
}
.room-lyrics-empty {
  color: #aebfc0;
}
.room-member {
  border: 1px solid rgba(184, 238, 218, 0.2);
  border-radius: 999px;
  background: rgba(211, 250, 233, 0.1);
}
.room-search-hint {
  margin-top: 9px;
  color: #aebfc0;
  font-size: 12px;
  min-height: 18px;
}
@media (max-width: 780px) {
  .room-hero {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .room-lyrics {
    border-left: 0;
    border-top: 1px solid rgba(200, 240, 221, 0.16);
    padding: 20px 0 0;
  }
}
</style>
