<script setup lang="ts">
defineOptions({ name: "ListenTogether" });

import IconLucideLogOut from "~icons/lucide/log-out";
import { useHistoryStore } from "@/stores/history";
import type { DropdownMenuItem } from "@/components/ui/SDropdownMenu.vue";
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
const history = useHistoryStore();
const lobbyTab = ref("create");
const status = useStatusStore();
const { copy } = useCopyText();
const roomLink = ref("");
const keyword = ref("");
const results = shallowRef<Track[]>([]);
const searching = ref(false);
const pending = reactive(new Set<string>());
const activeTab = ref("upcoming");
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
const visibleSongs = computed(() =>
  activeTab.value === "upcoming" ? upcoming.value : togetherRoom.value.played,
);
const queueTabs = computed(() => [
  { key: "upcoming", label: `待播 ${upcoming.value.length}` },
  { key: "played", label: `听过 ${togetherRoom.value.played.length}` },
]);
const lobbyTabs = [
  { key: "create", label: "创建房间" },
  { key: "join", label: "加入房间" },
];
const roomMenu = computed<DropdownMenuItem[]>(() => [
  {
    key: "leave",
    label: "退出房间",
    icon: markRaw(IconLucideLogOut),
    disabled: pending.has("room"),
  },
]);
const pushTracks = computed(() =>
  keyword.value.trim()
    ? results.value
    : history.tracks.filter((track) => track.source === "netease").slice(0, 20),
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
  track?.artists
    .map((artist) => artist.name?.trim())
    .filter(Boolean)
    .join(" / ") || "未知歌手";
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
const activeLyric = computed(() => lyricPreview.value.find((line) => line.active));
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
    else if (result.toast) toast.success(result.toast);
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
  void history.load();
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
  <div class="flex h-full flex-col text-on-surface">
    <div class="shrink-0 px-5 pb-2">
      <div class="mb-5 mt-2 flex items-center justify-between gap-4">
        <h1 class="text-3xl font-bold text-balance">多人一起听</h1>
        <SPopover v-if="togetherRoom.inRoom" align="end">
          <template #trigger>
            <SButton variant="ghost" round size="small" aria-label="查看房间成员">
              <span class="mr-1 flex -space-x-2" aria-hidden="true">
                <span
                  v-for="member in togetherRoom.members.slice(0, 3)"
                  :key="member.userId"
                  class="flex size-6 items-center justify-center overflow-hidden rounded-full bg-primary/15 ring-2 ring-surface text-xs text-primary"
                >
                  <img
                    v-if="member.avatarUrl"
                    :src="member.avatarUrl"
                    class="size-full object-cover"
                    alt=""
                  />
                  <span v-else>{{ member.nickname.slice(0, 1) }}</span>
                </span>
              </span>
              <span class="text-on-surface-variant">{{ togetherRoom.memberCount }} 人在线</span>
              <IconLucideChevronDown class="ml-1 size-3.5 text-on-surface-variant/60" />
            </SButton>
          </template>
          <div class="w-64">
            <div class="mb-3 text-sm font-medium">
              正在一起听 · {{ togetherRoom.memberCount }} 人
            </div>
            <div class="max-h-72 overflow-y-auto">
              <div
                v-for="member in togetherRoom.members"
                :key="member.userId"
                class="flex items-center gap-3 py-2"
              >
                <span
                  class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary"
                >
                  <img
                    v-if="member.avatarUrl"
                    :src="member.avatarUrl"
                    class="size-full object-cover"
                    alt=""
                  />
                  <span v-else>{{ member.nickname.slice(0, 1) }}</span>
                </span>
                <span class="truncate text-sm">{{ member.nickname }}</span>
              </div>
              <p v-if="!togetherRoom.members.length" class="py-2 text-sm text-on-surface-variant">
                正在获取成员信息…
              </p>
            </div>
          </div>
        </SPopover>
        <span v-else class="text-sm text-on-surface-variant/50">网易云官方房间</span>
      </div>

      <SAlert v-if="roomError" type="error" class="mb-4">{{ roomError }}</SAlert>
      <SAlert v-else-if="togetherRoom.syncError" type="warning" class="mb-4">
        {{ togetherRoom.syncError }}
      </SAlert>

      <template v-if="togetherRoom.inRoom">
        <div class="flex gap-5 pb-5">
          <SImg
            :src="currentTrack?.cover"
            :alt="currentTrack?.title"
            class="size-32 shrink-0 rounded-xl sm:size-40"
          />
          <div class="flex min-w-0 flex-1 flex-col justify-between py-0.5">
            <div class="min-w-0">
              <div class="mb-2 flex items-center gap-2 text-xs text-primary">
                <IconLucideHeadphones class="size-3.5" />
                {{ togetherRoom.paused ? "本机已暂停 · 房间继续播放" : "正在一起听" }}
              </div>
              <h2 class="truncate text-2xl font-bold leading-normal" :title="currentTrack?.title">
                {{ currentTrack?.title || "等待房间播放歌曲" }}
              </h2>
              <div
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant"
              >
                <span>{{ artistNames(currentTrack) }}</span>
                <span v-if="current?.recommendedBy" class="text-on-surface-variant/50">
                  {{ recommender(current) }} 推荐
                </span>
              </div>
            </div>
            <SButton
              variant="text"
              size="auto"
              class="my-2 w-fit max-w-full text-left"
              @click="status.isPlayerExpanded = true"
            >
              <span class="truncate text-sm text-on-surface-variant/70">
                {{ activeLyric?.text || "查看歌词" }}
              </span>
              <IconLucideChevronRight class="ml-1 size-3.5 shrink-0 text-on-surface-variant/40" />
            </SButton>
            <div class="mt-3 max-w-2xl" title="进度跟随官方房间同步">
              <div
                class="h-1 overflow-hidden rounded-full bg-on-surface/8"
                role="progressbar"
                aria-label="房间播放进度"
                :aria-valuenow="localMatchesRoom ? Math.round(progress) : 0"
                :aria-valuemin="0"
                :aria-valuemax="100"
              >
                <div
                  class="h-full rounded-full bg-primary/70"
                  :style="{ width: `${localMatchesRoom ? progress : 0}%` }"
                />
              </div>
              <div
                class="mt-2 flex items-center justify-between text-xs tabular-nums text-on-surface-variant/50"
              >
                <span>{{ localMatchesRoom ? clock(status.position) : "00:00" }}</span>
                <span>{{ clock(currentTrack?.duration || status.duration) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 pb-2">
          <div class="flex items-center gap-3">
            <SButton type="primary" variant="secondary" round @click="focusPush">
              <template #icon><IconLucideListPlus /></template>
              推歌
            </SButton>
            <SButton variant="secondary" round @click="copy(inviteLink)">
              <template #icon><IconLucideLink /></template>
              邀请好友
            </SButton>
            <SDropdownMenu :items="roomMenu" align="start" @select="run('leave', 'together-leave')">
              <template #trigger>
                <SButton
                  variant="secondary"
                  circle
                  aria-label="更多房间操作"
                  :loading="pending.has('room')"
                >
                  <template #icon><IconLucideEllipsis /></template>
                </SButton>
              </template>
            </SDropdownMenu>
          </div>
          <div class="w-52 shrink-0">
            <STabs v-model="activeTab" :tabs="queueTabs" type="segment" round />
          </div>
        </div>
      </template>
    </div>

    <template v-if="togetherRoom.inRoom">
      <div v-if="visibleSongs.length" class="flex min-h-48 flex-1 flex-col">
        <div
          class="mx-3 flex h-10 shrink-0 items-center gap-3 pl-5 pr-6 text-xs text-on-surface-variant/50"
        >
          <span class="w-8 shrink-0 text-center">#</span>
          <span class="min-w-0 flex-1">歌曲</span>
          <span class="hidden w-36 shrink-0 md:block">推荐人</span>
          <span class="w-28 shrink-0 text-center">
            {{ activeTab === "upcoming" ? "置顶" : "推歌" }}
          </span>
          <span class="w-8 shrink-0" />
          <span class="hidden w-14 shrink-0 text-center lg:block">时长</span>
        </div>
        <div class="min-h-0 flex-1">
          <SVirtualList
            :key="activeTab"
            :items="visibleSongs"
            :item-height="88"
            item-fixed
            height="100%"
            :get-item-key="
              (song: RoomSong, index: number) => song.songBizId || `${index}-${song.songId}`
            "
          >
            <template #default="{ item: song, index }: { item: RoomSong; index: number }">
              <div class="px-3 pb-3">
                <div
                  class="group flex h-19 items-center gap-3 rounded-xl border-2 border-solid border-primary/12 bg-surface-panel pl-3 pr-6 transition-colors hover:border-primary/30 hover:bg-on-surface/8"
                >
                  <span
                    class="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-on-surface-variant/60"
                  >
                    {{ index + 1 }}
                  </span>
                  <div class="flex min-w-0 flex-1 items-center gap-3">
                    <SImg :src="song.track?.cover" class="size-12 shrink-0 rounded-lg" />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-base font-medium" :title="songTitle(song)">
                        {{ songTitle(song) }}
                      </div>
                      <div class="mt-1 truncate text-sm text-on-surface-variant">
                        {{ artistNames(song.track) }}
                      </div>
                    </div>
                  </div>
                  <div
                    class="hidden w-36 shrink-0 truncate text-sm text-on-surface-variant/60 md:block"
                  >
                    {{
                      song.recommendedBy
                        ? recommender(song)
                        : activeTab === "upcoming"
                          ? "系统推荐"
                          : "—"
                    }}
                  </div>
                  <div class="flex w-28 shrink-0 justify-center">
                    <SButton
                      v-if="activeTab === 'upcoming'"
                      :type="song.pinned ? 'primary' : 'default'"
                      variant="ghost"
                      size="small"
                      round
                      :loading="pending.has(song.songId)"
                      :disabled="song.pinned"
                      :title="`${song.pinned ? '你已置顶' : '置顶这首歌'} · ${song.pinCount ?? '—'} 次置顶`"
                      :aria-label="`${song.pinned ? '已置顶' : '置顶'} ${songTitle(song)}，${song.pinCount ?? '未知'} 次`"
                      @click="
                        run('pin', 'together-pin', roomTrack(song), { songBizId: song.songBizId })
                      "
                    >
                      <template #icon><IconLucideArrowUpToLine /></template>
                      <span class="tabular-nums">{{ song.pinCount ?? "—" }}</span>
                      <IconLucideCheck v-if="song.pinned" class="ml-1 size-3" />
                    </SButton>
                    <SButton
                      v-else
                      variant="ghost"
                      size="small"
                      round
                      :loading="pending.has(song.songId)"
                      :disabled="queuedIds.has(song.songId)"
                      @click="run('push', 'together-push', roomTrack(song))"
                    >
                      <template #icon>
                        <IconLucideCheck v-if="queuedIds.has(song.songId)" />
                        <IconLucidePlus v-else />
                      </template>
                      {{ queuedIds.has(song.songId) ? "已在待播" : "推歌" }}
                    </SButton>
                  </div>
                  <SButton
                    variant="ghost"
                    size="small"
                    circle
                    class="shrink-0"
                    title="让整个房间播放这首歌"
                    :aria-label="`让房间播放 ${songTitle(song)}`"
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
                    <template #icon><IconLucidePlay /></template>
                  </SButton>
                  <span
                    class="hidden w-14 shrink-0 text-center text-sm tabular-nums text-on-surface-variant/50 lg:block"
                  >
                    {{ song.track ? clock(song.track.duration) : "—" }}
                  </span>
                </div>
              </div>
            </template>
          </SVirtualList>
        </div>
      </div>
      <div v-else class="flex min-h-48 flex-1 items-center justify-center">
        <div class="text-center text-on-surface-variant/50">
          <IconLucideListMusic class="mx-auto mb-3 size-12 opacity-30" />
          <div class="text-sm">
            {{
              activeTab === "upcoming"
                ? "还没有待播歌曲，推荐一首喜欢的吧"
                : "加入房间后听过的歌曲会显示在这里"
            }}
          </div>
          <SButton
            v-if="activeTab === 'upcoming'"
            type="primary"
            variant="text"
            class="mt-3"
            @click="focusPush"
          >
            推歌到房间
          </SButton>
        </div>
      </div>
    </template>

    <div v-else class="px-5 pb-8">
      <p class="text-sm text-on-surface-variant/60">
        和朋友听同一首歌，一起推荐接下来要播放的音乐。
      </p>
      <div class="mt-8 max-w-2xl">
        <div class="mb-7 w-56">
          <STabs v-model="lobbyTab" :tabs="lobbyTabs" type="segment" round />
        </div>
        <div v-if="lobbyTab === 'create'">
          <div class="flex items-center gap-5">
            <SImg :src="media.track?.cover" class="size-32 shrink-0 rounded-xl" />
            <div class="min-w-0">
              <div class="mb-2 text-xs text-on-surface-variant/50">从这首歌开始</div>
              <h2 class="truncate text-2xl font-bold">
                {{ media.track?.title || "先选一首喜欢的歌" }}
              </h2>
              <p class="mt-2 text-sm text-on-surface-variant">
                {{
                  media.track ? artistNames(media.track) : "播放网易云歌曲后，就可以邀请朋友一起听"
                }}
              </p>
            </div>
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-3">
            <SButton
              type="primary"
              variant="secondary"
              round
              :loading="pending.has('room')"
              @click="createRoom"
            >
              <template #icon><IconLucidePlus /></template>
              创建房间
            </SButton>
            <SButton
              variant="text"
              :disabled="pending.has('room')"
              @click="run('resume', 'together-resume')"
            >
              恢复已有房间
            </SButton>
          </div>
        </div>
        <div v-else class="max-w-xl">
          <SFormItem label="好友的邀请链接">
            <SInput
              v-model="roomLink"
              type="textarea"
              :rows="4"
              placeholder="粘贴网易云“多人一起听”邀请链接，也可以粘贴整段分享文案"
            />
          </SFormItem>
          <div class="mt-5 flex items-center gap-3">
            <SButton
              type="primary"
              variant="secondary"
              round
              :loading="pending.has('room')"
              @click="joinRoom"
            >
              <template #icon><IconLucideUsers /></template>
              加入房间
            </SButton>
            <SButton variant="text" @click="pasteLink">从剪贴板粘贴</SButton>
          </div>
        </div>
      </div>
    </div>

    <SDrawer
      v-if="togetherRoom.inRoom"
      v-model:open="pushOpen"
      title="推歌到房间"
      width="min(520px, 100vw)"
    >
      <section ref="searchArea" class="flex min-h-full flex-col">
        <div class="sticky top-0 z-1 bg-surface-bright px-5 pb-3 pt-1">
          <SInput
            v-model="keyword"
            round
            clearable
            placeholder="搜索歌曲或歌手"
            @keyup.enter="search"
          >
            <template #prefix>
              <IconLucideSearch class="size-4 text-on-surface-variant/40" />
            </template>
          </SInput>
          <div class="mt-4 flex items-center justify-between text-xs text-on-surface-variant/50">
            <span>
              {{
                searching
                  ? "正在搜索…"
                  : keyword.trim()
                    ? `搜索结果 · ${results.length} 首`
                    : "最近播放"
              }}
            </span>
            <span>{{ upcoming.length }} 首待播</span>
          </div>
        </div>
        <div v-if="pushTracks.length" class="px-3 pb-4">
          <div
            v-for="track in pushTracks"
            :key="track.id"
            class="mb-2 flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-on-surface/5"
          >
            <SImg :src="track.cover" class="size-12 shrink-0 rounded-lg" />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ track.title }}</div>
              <div class="mt-1 truncate text-sm text-on-surface-variant/60">
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
        <div
          v-else
          class="flex flex-1 items-center justify-center px-8 py-20 text-center text-on-surface-variant/50"
        >
          <div>
            <SLoading v-if="searching" class="mx-auto mb-3 text-3xl text-primary/70" />
            <IconLucideSearch v-else class="mx-auto mb-3 size-10 opacity-30" />
            <p class="text-sm">
              {{
                searching
                  ? "正在寻找歌曲"
                  : keyword.trim()
                    ? "没有找到歌曲，换个关键词试试"
                    : "搜索喜欢的音乐，推荐给房间里的朋友"
              }}
            </p>
          </div>
        </div>
      </section>
    </SDrawer>
  </div>
</template>
