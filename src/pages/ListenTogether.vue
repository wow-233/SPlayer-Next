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
const searchWrap = ref<HTMLElement | null>(null);
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
  searchWrap.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = searchWrap.value?.querySelector("input");
  input?.focus({ preventScroll: true });
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
  <div
    class="mx-auto flex h-full max-w-[1400px] flex-col gap-6 overflow-y-auto px-6 pt-6 pb-10 [scrollbar-gutter:stable]"
  >
    <!-- 页头 -->
    <header class="flex items-start justify-between gap-6">
      <div class="min-w-0">
        <h1 class="text-3xl font-bold text-on-surface text-balance">多人一起听</h1>
        <p class="mt-2 flex items-center gap-2 text-sm text-on-surface-variant/70">
          <template v-if="togetherRoom.inRoom">
            <IconLucideUsersRound class="size-4" />
            {{ togetherRoom.memberCount }} 人在线 · 房间 {{ togetherRoom.roomId }}
          </template>
          <template v-else>和好友一起听，推歌会进入同一个房间队列</template>
        </p>
      </div>
      <div v-if="togetherRoom.inRoom" class="flex shrink-0 items-center gap-2">
        <SButton type="primary" round size="small" :disabled="!!busy" @click="focusPush">
          <template #icon><IconLucidePlus /></template>
          推歌
        </SButton>
        <SButton variant="secondary" round size="small" @click="copy(inviteLink)">
          <template #icon><IconLucideCopy /></template>
          复制邀请链接
        </SButton>
        <SButton
          variant="ghost"
          round
          size="small"
          :disabled="!!busy"
          @click="run('leave', 'together-leave')"
        >
          <template #icon><IconLucideLogOut /></template>
          退出房间
        </SButton>
      </div>
    </header>

    <SAlert v-if="roomError" type="error">{{ roomError }}</SAlert>

    <!-- 未加入房间：创建 / 加入 -->
    <div v-if="!togetherRoom.inRoom" class="grid gap-5 md:grid-cols-2">
      <SCard radius="xl" class="flex flex-col p-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <IconLucideDisc3 class="size-5 text-primary/70" />
          创建房间
        </h2>
        <p class="mt-2 text-sm text-on-surface-variant/70">
          已有官方房间会先恢复；否则以当前网易云歌曲创建。
        </p>
        <div
          class="mt-5 flex items-center gap-4 rounded-xl border border-outline-variant/20 bg-surface-panel/60 p-4"
        >
          <SImg
            :src="media.track?.cover"
            :alt="media.track?.title"
            class="size-16 shrink-0 rounded-lg"
          />
          <div class="min-w-0">
            <div class="truncate font-medium text-on-surface">
              {{ media.track?.title || "还没有播放歌曲" }}
            </div>
            <div class="mt-1 truncate text-sm text-on-surface-variant/70">
              {{ artistNames(media.track) }}
            </div>
          </div>
        </div>
        <div class="mt-auto flex flex-wrap gap-2 pt-6">
          <SButton type="primary" round :disabled="!!busy" @click="createRoom">
            创建或恢复房间
          </SButton>
          <SButton
            variant="secondary"
            round
            :disabled="!!busy"
            @click="run('resume', 'together-resume')"
          >
            恢复已有房间
          </SButton>
        </div>
      </SCard>

      <SCard radius="xl" class="flex flex-col p-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <IconLucideLink class="size-5 text-primary/70" />
          加入好友房间
        </h2>
        <p class="mt-2 text-sm text-on-surface-variant/70">
          粘贴网易云手机端"多人一起听"邀请链接。
        </p>
        <SInput
          v-model="roomLink"
          type="textarea"
          class="mt-5"
          :rows="3"
          placeholder="https://st.music.163.com/listen-together/multishare/…"
        />
        <div class="mt-auto flex flex-wrap gap-2 pt-6">
          <SButton variant="secondary" round @click="pasteLink">粘贴链接</SButton>
          <SButton type="primary" round :disabled="!!busy" @click="joinRoom">加入房间</SButton>
        </div>
      </SCard>
    </div>

    <!-- 房间内 -->
    <template v-else>
      <!-- 当前播放 Hero -->
      <SCard radius="xl" flush class="overflow-hidden">
        <div class="grid gap-6 p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div class="flex min-w-0 flex-col items-center justify-center">
            <div class="room-record border-8 border-surface-panel">
              <SImg
                v-if="currentTrack?.cover"
                :src="currentTrack.cover"
                :alt="currentTrack.title"
                class="room-record-cover"
              />
              <span v-else class="text-primary/70"><IconLucideMusic2 class="size-16" /></span>
            </div>
            <div class="mt-7 w-full text-center">
              <span
                class="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <span
                  class="size-1.5 rounded-full bg-primary"
                  :class="{ 'animate-pulse': !togetherRoom.paused }"
                />
                {{ togetherRoom.paused ? "房间已暂停" : "正在一起听" }}
              </span>
              <h2 class="mt-3 truncate text-2xl font-bold text-on-surface">
                {{ currentTrack?.title || "等待房间播放歌曲" }}
              </h2>
              <p class="mt-1 truncate text-sm text-on-surface-variant/80">
                {{ artistNames(currentTrack) }}
              </p>
              <p v-if="current?.recommendedBy" class="mt-1.5 text-xs text-on-surface-variant/60">
                由 {{ recommender(current) }} 推荐
              </p>
            </div>
            <div
              v-if="localMatchesRoom"
              class="mt-6 w-full max-w-md"
              title="进度由官方房间统一同步"
            >
              <div class="h-1 overflow-hidden rounded-full bg-on-surface-variant/15">
                <div
                  class="h-full rounded-full bg-primary transition-[width] duration-500 ease-linear"
                  :style="{ width: `${progress}%` }"
                />
              </div>
              <div
                class="mt-2 flex justify-between text-xs tabular-nums text-on-surface-variant/60"
              >
                <span>{{ clock(status.position) }}</span>
                <span>房间同步 · 不可拖动</span>
                <span>{{ clock(status.duration) }}</span>
              </div>
            </div>
          </div>

          <div
            class="flex min-w-0 flex-col border-outline-variant/15 max-lg:border-t lg:border-l lg:pl-6"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-semibold text-on-surface">歌词</span>
              <SButton variant="ghost" size="small" round @click="status.isPlayerExpanded = true">
                查看完整歌词
              </SButton>
            </div>
            <div v-if="lyricPreview.length" class="room-lyrics mt-4 min-h-0 flex-1 overflow-hidden">
              <div
                v-for="line in lyricPreview"
                :key="line.key"
                class="mb-5"
                :class="line.active ? 'text-on-surface' : 'text-on-surface-variant/50'"
              >
                <div
                  class="leading-relaxed"
                  :class="line.active ? 'text-lg font-semibold' : 'text-base'"
                >
                  {{ line.text }}
                </div>
                <div v-if="line.translation" class="mt-0.5 text-sm opacity-80">
                  {{ line.translation }}
                </div>
              </div>
            </div>
            <p v-else class="mt-4 flex-1 text-sm text-on-surface-variant/50">
              房间歌曲的歌词会显示在这里
            </p>
          </div>
        </div>
      </SCard>

      <!-- 房间成员 -->
      <div v-if="togetherRoom.members.length" class="flex flex-wrap items-center gap-2">
        <span class="mr-1 text-sm text-on-surface-variant/70">房间成员</span>
        <span
          v-for="member in togetherRoom.members"
          :key="member.userId"
          class="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-panel/60 px-2.5 py-1 text-sm text-on-surface"
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
        <!-- 队列 -->
        <SCard radius="xl" class="min-w-0 p-6">
          <div class="mb-4 flex items-center justify-between gap-4">
            <h2 class="text-lg font-semibold text-on-surface">房间队列</h2>
            <div class="w-44">
              <STabs
                v-model="activeTab"
                type="segment"
                round
                size="small"
                :tabs="[
                  { key: 'upcoming', label: `待播 ${upcoming.length}` },
                  { key: 'played', label: `听过 ${togetherRoom.played.length}` },
                ]"
              />
            </div>
          </div>

          <div
            v-if="activeTab === 'upcoming' && !upcoming.length"
            class="flex flex-col items-center py-12 text-center text-on-surface-variant/60"
          >
            <IconLucideListMusic class="mb-3 size-10 opacity-30" />
            <div class="text-sm">房间还没有待播歌曲</div>
            <SButton variant="ghost" round size="small" class="mt-3" @click="focusPush">
              去推歌
            </SButton>
          </div>
          <div
            v-if="activeTab === 'played' && !togetherRoom.played.length"
            class="flex flex-col items-center py-12 text-center text-on-surface-variant/60"
          >
            <IconLucideHistory class="mb-3 size-10 opacity-30" />
            <div class="text-sm">进入房间后播放过的歌会显示在这里</div>
          </div>

          <div
            v-for="(song, index) in activeTab === 'upcoming' ? upcoming : togetherRoom.played"
            :key="`${activeTab}-${index}-${song.songId}`"
            class="group flex items-center gap-3 rounded-xl border-b border-outline-variant/15 px-2 py-2.5 transition-colors last:border-0 hover:bg-surface-panel/70"
          >
            <span class="w-6 shrink-0 text-center text-sm tabular-nums text-on-surface-variant/60">
              {{ index + 1 }}
            </span>
            <SImg
              v-if="song.track?.cover"
              :src="song.track.cover"
              :alt="songTitle(song)"
              class="size-11 shrink-0 rounded-lg"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium text-on-surface">{{ songTitle(song) }}</div>
              <div class="truncate text-xs text-on-surface-variant/70">
                {{ artistNames(song.track) }}
              </div>
              <div v-if="song.recommendedBy" class="truncate text-xs text-primary/70">
                {{ recommender(song) }} 推荐
              </div>
            </div>
            <template v-if="activeTab === 'upcoming'">
              <button
                class="inline-flex shrink-0 items-center gap-1 rounded-full border border-outline-variant/25 px-2.5 py-1 text-xs tabular-nums text-on-surface-variant transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-45 disabled:cursor-not-allowed"
                :disabled="!!busy"
                :title="
                  song.pinCount === undefined ? '置顶次数暂不可用' : `${song.pinCount} 人置顶`
                "
                @click="run('pin', 'together-pin', roomTrack(song))"
              >
                <IconLucidePin class="size-3.5" />
                <span>{{ song.pinCount ?? "—" }}</span>
              </button>
              <SButton
                variant="ghost"
                circle
                size="small"
                title="播放"
                :disabled="!!busy"
                @click="run('goto', 'together-goto', roomTrack(song))"
              >
                <template #icon><IconLucidePlay /></template>
              </SButton>
            </template>
            <template v-else>
              <SButton
                variant="ghost"
                circle
                size="small"
                :title="queuedIds.has(song.songId) ? '已在房间' : '加入待播'"
                :disabled="!!busy || queuedIds.has(song.songId)"
                @click="run('push', 'together-push', roomTrack(song))"
              >
                <template #icon><IconLucidePlus /></template>
              </SButton>
              <SButton
                variant="ghost"
                circle
                size="small"
                title="重播"
                :disabled="!!busy"
                @click="run('goto', 'together-goto', roomTrack(song))"
              >
                <template #icon><IconLucideRotateCcw /></template>
              </SButton>
            </template>
          </div>
        </SCard>

        <!-- 搜索推歌 -->
        <SCard radius="xl" class="flex min-w-0 flex-col p-6">
          <h2 class="text-lg font-semibold text-on-surface">推歌到房间</h2>
          <p class="mt-1 text-sm text-on-surface-variant/70">
            推荐的歌曲会出现在所有人的待播列表，播放由房间统一控制。
          </p>
          <div ref="searchWrap">
            <SInput
              v-model="keyword"
              round
              clearable
              class="mt-4"
              placeholder="输入歌名或歌手，自动搜索"
              @input="scheduleSearch"
              @keyup.enter="search"
            >
              <template #prefix><IconLucideSearch class="size-4 opacity-50" /></template>
            </SInput>
          </div>
          <p class="mt-2 min-h-5 text-xs text-on-surface-variant/60">
            {{
              searching
                ? "正在搜索…"
                : keyword.trim()
                  ? `找到 ${results.length} 首 · 点击推歌加入待播`
                  : "搜索后可连续推歌，无需重复打开页面"
            }}
          </p>
          <div class="mt-2 min-h-0 flex-1 overflow-y-auto">
            <div
              v-for="track in results"
              :key="track.id"
              class="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-panel/70"
            >
              <SImg :src="track.cover" :alt="track.title" class="size-10 shrink-0 rounded-lg" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-on-surface">{{ track.title }}</div>
                <div class="truncate text-xs text-on-surface-variant/70">
                  {{ artistNames(track) }}
                </div>
              </div>
              <SButton
                type="primary"
                circle
                size="small"
                :title="queuedIds.has(String(track.id)) ? '已在房间' : '推歌'"
                :disabled="!!busy || queuedIds.has(String(track.id))"
                @click="run('push', 'together-push', track)"
              >
                <template #icon><IconLucidePlus /></template>
              </SButton>
              <SButton
                variant="secondary"
                circle
                size="small"
                title="立即播放"
                :disabled="!!busy"
                @click="run('goto', 'together-goto', track)"
              >
                <template #icon><IconLucidePlay /></template>
              </SButton>
            </div>
          </div>
        </SCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 黑胶唱片：经典视觉，边框走主题 token */
.room-record {
  width: min(230px, 60vw);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: repeating-radial-gradient(circle at center, #171a19 0 4px, #202624 5px 8px);
  box-shadow:
    0 0 0 1px rgb(255 255 255 / 0.06),
    0 18px 40px rgb(0 0 0 / 0.35);
  transition: transform 0.5s ease;
}
.room-record:hover {
  transform: scale(1.02);
}
.room-record-cover {
  width: 58%;
  aspect-ratio: 1;
  border-radius: 50%;
  object-fit: cover;
}

/* 歌词预览上下渐隐 */
.room-lyrics {
  mask-image: linear-gradient(to bottom, transparent, black 12%, black 86%, transparent);
}
</style>
