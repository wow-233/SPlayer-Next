<script setup lang="ts">
/**
 * 副屏氛围屏
 *
 * 全屏展示「封面 + 当前歌词（含翻译）+ 下一句」，带背景模糊取色与逐字高亮。
 * 复用共享的 useNowPlayingSync 获取 track/lyric/playing/当前行（含 RAF 插值）。
 */
import { pickPrimaryIndex } from "lyric-kit";
import { formatArtists } from "@shared/utils/track";
import {
  useNowPlayingSync,
  getNowPlayingCurrentMs,
} from "@windows/shared/composables/useNowPlayingSync";

const { track, lyric, playing, primaryIndex } = useNowPlayingSync({
  pickIndex: pickPrimaryIndex,
  logTag: "ambiance",
});

/** 高频当前时间（驱动逐字高亮） */
const nowMs = ref(0);
let raf = 0;
const tick = (): void => {
  nowMs.value = getNowPlayingCurrentMs();
  raf = requestAnimationFrame(tick);
};

onMounted(() => tick());
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
});

const current = computed(() => (primaryIndex.value >= 0 ? lyric.value[primaryIndex.value] : null));
const next = computed(() =>
  primaryIndex.value >= 0 ? lyric.value[primaryIndex.value + 1] : null,
);
const cover = computed(() => track.value?.coverOriginal ?? track.value?.cover ?? "");
const title = computed(() => track.value?.title ?? "SPlayer-Next");
const artists = computed(() => formatArtists(track.value?.artists) || "暂无播放");

/** 当前行纯文本（无逐字时的兜底） */
const currentText = computed(() =>
  current.value ? current.value.words.map((w) => w.word).join("") : "",
);
const nextText = computed(() => (next.value ? next.value.words.map((w) => w.word).join("") : ""));
const hasWordByWord = computed(() => (current.value?.words.length ?? 0) > 1);
</script>

<template>
  <div class="ambiance" :class="{ paused: !playing }">
    <!-- 背景：模糊封面 + 压暗 -->
    <div
      class="bg"
      :style="cover ? { backgroundImage: `url(${cover})` } : undefined"
      aria-hidden="true"
    />
    <div class="bg-mask" aria-hidden="true" />

    <div class="stage">
      <!-- 封面 -->
      <div class="cover-wrap">
        <img v-if="cover" class="cover" :src="cover" alt="" />
        <div v-else class="cover cover-fallback">
          <span class="cover-note">♪</span>
        </div>
        <div class="meta">
          <div class="title">{{ title }}</div>
          <div class="artists">{{ artists }}</div>
        </div>
      </div>

      <!-- 歌词 -->
      <div class="lyrics">
        <div class="line-current">
          <template v-if="current">
            <template v-if="hasWordByWord">
              <span
                v-for="(w, i) in current.words"
                :key="i"
                class="word"
                :class="{ played: nowMs >= w.startTime }"
                >{{ w.word }}</span
              >
            </template>
            <template v-else>{{ currentText }}</template>
          </template>
          <span v-else class="placeholder">{{ title }}</span>
        </div>
        <div v-if="current?.translatedLyric" class="line-translation">
          {{ current.translatedLyric }}
        </div>
        <div v-if="nextText" class="line-next">{{ nextText }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ambiance {
  position: fixed;
  inset: 0;
  overflow: hidden;
  color: #fff;
  background: #0b0b0f;
  user-select: none;
}

.bg {
  position: absolute;
  inset: -10%;
  background-position: center;
  background-size: cover;
  filter: blur(48px) saturate(1.3);
  transform: scale(1.15);
  opacity: 0.55;
  transition: background-image 0.6s ease;
}

.bg-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 30% 40%,
    rgba(0, 0, 0, 0.25),
    rgba(0, 0, 0, 0.72) 75%
  );
}

.stage {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4vw;
  padding: 5vh 5vw;
  box-sizing: border-box;
}

.cover-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3vh;
  flex: 0 0 auto;
}

.cover {
  width: min(40vh, 30vw);
  height: min(40vh, 30vw);
  border-radius: 1.5rem;
  object-fit: cover;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
  transition: transform 0.6s ease, opacity 0.6s ease;
}

.paused .cover {
  transform: scale(0.96);
  opacity: 0.82;
}

.cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
}

.cover-note {
  font-size: 8vh;
  opacity: 0.4;
}

.meta {
  max-width: min(40vh, 30vw);
  text-align: center;
}

.title {
  font-size: clamp(1.2rem, 2.6vh, 2.2rem);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artists {
  margin-top: 0.4rem;
  font-size: clamp(0.85rem, 1.6vh, 1.2rem);
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 46vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.6vh;
}

.line-current {
  font-size: clamp(1.8rem, 6vh, 4.2rem);
  font-weight: 700;
  line-height: 1.25;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.word {
  color: rgba(255, 255, 255, 0.38);
  transition: color 0.18s ease;
}

.word.played {
  color: #fff;
}

.line-translation {
  font-size: clamp(1rem, 2.6vh, 1.8rem);
  opacity: 0.7;
}

.line-next {
  font-size: clamp(1rem, 2.4vh, 1.7rem);
  opacity: 0.38;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder {
  opacity: 0.5;
}

/* 竖屏 / 窄屏：改为纵向堆叠 */
@media (max-aspect-ratio: 1/1) {
  .stage {
    flex-direction: column;
    gap: 4vh;
  }
  .lyrics {
    max-width: 86vw;
    align-items: center;
    text-align: center;
  }
  .cover {
    width: min(40vh, 62vw);
    height: min(40vh, 62vw);
  }
}
</style>
