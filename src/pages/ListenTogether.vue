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
const pending = reactive(new Set<string>());
const activeTab = ref<"upcoming" | "played">("upcoming");
const pushOpen = ref(false);
const searchArea = ref<HTMLElement | null>(null);
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
const upcoming = computed(() => togetherRoom.value.queue.slice(1));
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
  const key = track && name !== "create" ? String(track.id) : "room";
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const result = await invokeTogether(menuId, track, data);
    if (result.copyText) await copy(result.copyText);
    else if (result.toast && name !== "push" && name !== "pin") toast.success(result.toast);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "房间操作失败");
  } finally {
    pending.delete(key);
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
  searchSequence += 1;
  searching.value = !!keyword.value.trim();
  if (!keyword.value.trim()) {
    results.value = [];
    searching.value = false;
    return;
  }
  searchTimer = setTimeout(() => void search(), 280);
};
watch(keyword, scheduleSearch);

const focusPush = async (): Promise<void> => {
  pushOpen.value = true;
  await nextTick();
  searchArea.value?.querySelector("input")?.focus({ preventScroll: true });
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
  <div class="room-shell mx-auto w-full max-w-7xl px-5 pb-10 pt-3">
    <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div class="mb-1 text-xs text-on-surface-variant/60">网易云官方房间</div>
        <h1 class="text-3xl font-bold text-on-surface">多人一起听</h1>
        <p class="mt-2 text-sm text-on-surface-variant">
          {{
            togetherRoom.inRoom
              ? `${togetherRoom.memberCount} 人在线 · 所有人听同一首歌`
              : "和好友一起听，推歌会进入同一个房间队列"
          }}
        </p>
      </div>
      <div v-if="togetherRoom.inRoom" class="flex flex-wrap gap-2">
        <SButton type="primary" variant="secondary" round @click="focusPush">
          <template #icon><IconLucideListPlus /></template>
          推歌
        </SButton>
        <SButton variant="tertiary" round @click="copy(inviteLink)">
          <template #icon><IconLucideLink /></template>
          邀请好友
        </SButton>
        <SButton
          variant="ghost"
          round
          :loading="pending.has('room')"
          @click="run('leave', 'together-leave')"
        >
          退出房间
        </SButton>
      </div>
    </div>

    <SAlert v-if="roomError" type="error" class="mb-5">{{ roomError }}</SAlert>
    <SAlert v-else-if="togetherRoom.syncError" type="warning" class="mb-5">
      {{ togetherRoom.syncError }}
    </SAlert>

    <template v-if="!togetherRoom.inRoom">
      <div class="grid gap-5 md:grid-cols-2">
        <section class="room-panel bg-surface-panel">
          <h2 class="text-lg font-semibold">创建房间</h2>
          <p class="mt-2 text-sm text-on-surface-variant">
            已有官方房间会先恢复；否则以当前网易云歌曲创建。
          </p>
          <div class="mt-5 rounded-xl bg-primary/5 p-4">
            <div class="font-medium">{{ media.track?.title || "还没有播放歌曲" }}</div>
            <div class="mt-1 text-sm text-on-surface-variant">{{ artistNames(media.track) }}</div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <SButton type="primary" round :loading="pending.has('room')" @click="createRoom">
              创建或恢复房间
            </SButton>
            <SButton
              variant="tertiary"
              round
              :disabled="pending.has('room')"
              @click="run('resume', 'together-resume')"
            >
              恢复已有房间
            </SButton>
          </div>
        </section>
        <section class="room-panel bg-surface-panel">
          <h2 class="text-lg font-semibold">加入好友房间</h2>
          <p class="mt-2 text-sm text-on-surface-variant">粘贴网易云手机端“多人一起听”邀请链接。</p>
          <SInput
            v-model="roomLink"
            type="textarea"
            :rows="3"
            class="mt-5"
            placeholder="https://st.music.163.com/listen-together/multishare/…"
          />
          <div class="mt-3 flex gap-2">
            <SButton variant="tertiary" round @click="pasteLink">粘贴链接</SButton>
            <SButton type="primary" round :loading="pending.has('room')" @click="joinRoom">
              加入房间
            </SButton>
          </div>
        </section>
      </div>
    </template>

    <template v-else>
      <section class="room-panel room-hero bg-surface-panel mb-5">
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
            <div class="room-eyebrow">
              {{ togetherRoom.paused ? "本机已暂停 · 房间继续播放" : "正在一起听" }}
            </div>
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
            <SButton variant="text" size="small" @click="status.isPlayerExpanded = true">
              查看完整歌词
            </SButton>
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

      <div>
        <section class="room-panel bg-surface-panel min-w-0">
          <div class="mb-5 flex items-center gap-1 border-b border-on-surface/10 pb-3">
            <button
              class="room-tab"
              :class="{ 'room-tab-active': activeTab === 'upcoming' }"
              @click="activeTab = 'upcoming'"
            >
              待播
              <span class="room-tab-count">{{ upcoming.length }}</span>
            </button>
            <button
              class="room-tab"
              :class="{ 'room-tab-active': activeTab === 'played' }"
              @click="activeTab = 'played'"
            >
              听过
              <span class="room-tab-count">{{ togetherRoom.played.length }}</span>
            </button>
            <SButton class="ml-auto" type="primary" variant="text" size="small" @click="focusPush">
              推歌
            </SButton>
          </div>
          <div
            v-if="activeTab === 'upcoming' && !upcoming.length"
            class="py-10 text-center text-sm text-on-surface-variant"
          >
            房间还没有待播歌曲
            <SButton type="primary" variant="text" size="small" @click="focusPush">去推歌</SButton>
          </div>
          <div
            v-if="activeTab === 'played' && !togetherRoom.played.length"
            class="py-10 text-center text-sm text-on-surface-variant"
          >
            进入房间后播放过的歌会显示在这里
          </div>
          <div
            v-for="(song, index) in activeTab === 'upcoming' ? upcoming : togetherRoom.played"
            :key="song.songBizId || `${activeTab}-${index}-${song.songId}`"
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
              <SButton
                type="primary"
                variant="tertiary"
                size="small"
                round
                :loading="pending.has(song.songId)"
                :disabled="song.pinned"
                :title="song.pinned ? '你已置顶这首歌' : '置顶这首歌'"
                @click="run('pin', 'together-pin', roomTrack(song), { songBizId: song.songBizId })"
              >
                <template #icon><IconLucideArrowUpToLine /></template>
                {{ song.pinned ? "已置顶" : "置顶" }} {{ song.pinCount ?? "—" }}
              </SButton>
              <SButton
                variant="ghost"
                size="small"
                :disabled="pending.has(song.songId)"
                @click="
                  run(
                    'goto',
                    'together-goto',
                    roomTrack(song),
                    song.songBizId ? { songBizId: song.songBizId } : undefined,
                  )
                "
              >
                播放
              </SButton>
            </template>
            <template v-else>
              <SButton
                type="primary"
                variant="ghost"
                size="small"
                :loading="pending.has(song.songId)"
                :disabled="queuedIds.has(song.songId)"
                @click="run('push', 'together-push', roomTrack(song))"
              >
                {{ queuedIds.has(song.songId) ? "已在待播" : "加入待播" }}
              </SButton>
              <SButton
                variant="ghost"
                size="small"
                :disabled="pending.has(song.songId)"
                @click="
                  run(
                    'goto',
                    'together-goto',
                    roomTrack(song),
                    song.songBizId ? { songBizId: song.songBizId } : undefined,
                  )
                "
              >
                重播
              </SButton>
            </template>
          </div>
        </section>

        <SDrawer v-model:open="pushOpen" title="推歌到房间" width="min(520px, 100vw)">
          <section ref="searchArea" class="px-5 pb-5 min-w-0">
            <p class="mt-1 text-sm text-on-surface-variant">
              推荐的歌曲会出现在所有人的待播列表。播放由房间统一控制。
            </p>
            <div class="mt-4">
              <SInput
                v-model="keyword"
                round
                clearable
                placeholder="搜索网易云歌曲或歌手"
                @keyup.enter="search"
              >
                <template #prefix><IconLucideSearch class="size-4 opacity-50" /></template>
              </SInput>
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
                  <div class="truncate text-xs text-on-surface-variant">
                    {{ artistNames(track) }}
                  </div>
                </div>
                <SButton
                  :type="queuedIds.has(String(track.id)) ? 'default' : 'primary'"
                  :variant="queuedIds.has(String(track.id)) ? 'ghost' : 'secondary'"
                  size="small"
                  round
                  :loading="pending.has(String(track.id))"
                  :disabled="queuedIds.has(String(track.id))"
                  @click="run('push', 'together-push', track)"
                >
                  <template #icon>
                    <IconLucideCheck v-if="queuedIds.has(String(track.id))" />
                    <IconLucidePlus v-else />
                  </template>
                  {{
                    String(track.id) === togetherRoom.currentSongId
                      ? "正在播放"
                      : queuedIds.has(String(track.id))
                        ? "已在待播"
                        : "推歌"
                  }}
                </SButton>
              </div>
            </div>
          </section>
        </SDrawer>
      </div>
    </template>
  </div>
</template>

<style scoped>
.room-shell {
  min-height: 100%;
  color: rgb(var(--s-on-surface));
}
.room-panel {
  min-width: 0;
  border: 1px solid rgb(var(--s-primary) / 0.15);
  border-radius: 18px;
  padding: 22px;
}
.room-hero {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 26px;
  min-height: 340px;
}
.room-record-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.room-record {
  width: min(178px, 48vw);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 7px solid #232726;
  border-radius: 50%;
  background: repeating-radial-gradient(circle at center, #181c1b 0 4px, #222927 5px 8px);
  box-shadow: 0 12px 26px rgb(0 0 0 / 20%);
}
.room-record-cover {
  width: 62%;
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
}
.room-record-placeholder {
  color: rgb(var(--s-primary));
  font-size: 60px;
}
.room-track-info {
  width: 100%;
  margin-top: 20px;
  text-align: center;
}
.room-eyebrow {
  color: rgb(var(--s-primary));
  font-size: 12px;
  font-weight: 600;
}
.room-track-info h2 {
  margin: 7px 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 22px;
  font-weight: 700;
}
.room-track-info p {
  margin: 0;
  color: rgb(var(--s-on-surface) / 0.6);
}
.room-track-info .room-recommender {
  margin-top: 5px;
  font-size: 12px;
}
.room-progress {
  width: 100%;
  max-width: 440px;
  margin-top: 20px;
}
.room-progress-track {
  height: 4px;
  overflow: hidden;
  border-radius: 5px;
  background: rgb(var(--s-on-surface) / 0.1);
}
.room-progress-track > div {
  height: 100%;
  background: rgb(var(--s-primary));
}
.room-progress-time {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  color: rgb(var(--s-on-surface) / 0.48);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.room-lyrics {
  min-width: 0;
  padding: 8px 0 8px 24px;
  border-left: 1px solid rgb(var(--s-on-surface) / 0.08);
}
.room-lyrics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  font-weight: 600;
}
.room-lyrics-lines {
  max-height: 300px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, transparent, black 14%, black 84%, transparent);
}
.room-lyric-line {
  margin: 0 0 13px;
  color: rgb(var(--s-on-surface) / 0.5);
  font-size: 15px;
  line-height: 1.45;
}
.room-lyric-line.active {
  color: rgb(var(--s-on-surface));
  font-size: 18px;
  font-weight: 650;
}
.room-lyric-translation {
  margin-top: 3px;
  font-size: 0.82em;
}
.room-lyrics-empty,
.room-search-hint {
  color: rgb(var(--s-on-surface) / 0.5);
  font-size: 12px;
}
.room-member {
  border: 1px solid rgb(var(--s-primary) / 0.12);
  border-radius: 999px;
  background: rgb(var(--s-on-surface) / 0.05);
}
.room-tab {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgb(var(--s-on-surface) / 0.6);
  padding: 7px 12px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.room-tab:hover {
  background: rgb(var(--s-on-surface) / 0.06);
}
.room-tab-active {
  background: rgb(var(--s-on-surface) / 0.1);
  color: rgb(var(--s-on-surface));
  font-weight: 600;
}
.room-tab-count {
  margin-left: 3px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 780px) {
  .room-hero {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .room-lyrics {
    border-left: 0;
    border-top: 1px solid rgb(var(--s-on-surface) / 0.08);
    padding: 18px 0 0;
  }
}
</style>
