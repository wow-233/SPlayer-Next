<script setup lang="ts">
/**
 * 副屏氛围屏
 *
 * 全屏展示「封面 + 滚动歌词（lyric-dom 逐字弹簧动画引擎）」，带背景模糊取色。
 * 复用共享的 useNowPlayingSync 获取 track/lyric/playing；设置实时读取并响应变更。
 * 设置项映射：showTranslation → 逐行翻译；showPreviousLine → 已唱行隐藏；
 * showNextLine → 未唱行透明度（关=只看当前行）。
 */
import type { AmbianceSettings } from "@shared/types/settings";
import { DEFAULTS, LyricRenderer } from "lyric-dom";
import "lyric-dom/renderer.css";
import { pickPrimaryIndex } from "lyric-kit";
import { formatArtists } from "@shared/utils/track";
import {
  useNowPlayingSync,
  getNowPlayingCurrentMs,
} from "@windows/shared/composables/useNowPlayingSync";

const { track, lyric, playing } = useNowPlayingSync({
  pickIndex: pickPrimaryIndex,
  logTag: "ambiance",
});

const config = reactive<AmbianceSettings>({
  showTranslation: true,
  showNextLine: true,
  showPreviousLine: true,
  fontScale: 1,
  backgroundBlur: 48,
  showCover: true,
  displayMode: "auto",
});

const lyricsEl = ref<HTMLElement>();
let renderer: LyricRenderer | null = null;
let raf = 0;
let unsubConfig: (() => void) | null = null;

/** 按设置推导渲染器外观配置 */
const rendererConfig = () => ({
  alignment: "center" as const,
  alignPosition: 0.5,
  showTranslation: config.showTranslation,
  hidePassedLines: !config.showPreviousLine,
  inactiveAlpha: config.showNextLine ? 0.38 : 0,
  enableWordHighlight: true,
  enableEmphasizeEffect: true,
  enableBlur: true,
  minInterludeGap: DEFAULTS.minInterludeGap,
  breatheCycleTarget: DEFAULTS.breatheCycleTarget,
});

/** 把设置应用到渲染器 */
const applyRendererConfig = (): void => {
  renderer?.setConfig(rendererConfig());
};

const tick = (): void => {
  renderer?.setCurrentTime(getNowPlayingCurrentMs());
  raf = requestAnimationFrame(tick);
};

/** 播放中才持续驱动渲染器；暂停时冻结，恢复时先校正一帧再继续 */
const syncRafLoop = (): void => {
  if (playing.value) {
    if (!raf) {
      renderer?.setCurrentTime(getNowPlayingCurrentMs());
      raf = requestAnimationFrame(tick);
    }
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
};

watch(playing, (value) => {
  renderer?.setPlaying(value);
  syncRafLoop();
});

watch(lyric, (lines) => renderer?.setLyrics(lines));

watch(
  () => ({ ...config }),
  () => applyRendererConfig(),
);

onMounted(async () => {
  try {
    const saved = (await window.api.config.get("ambiance")) as AmbianceSettings | undefined;
    if (saved) Object.assign(config, saved);
  } catch (error) {
    console.error("[ambiance] load config failed", error);
  }
  if (lyricsEl.value) {
    renderer = new LyricRenderer(lyricsEl.value, rendererConfig());
    renderer.setLyrics(lyric.value);
    renderer.setPlaying(playing.value);
    syncRafLoop();
  }
  unsubConfig = window.api.window.onAmbianceConfigChange((next) => Object.assign(config, next));
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  renderer?.dispose();
  renderer = null;
  unsubConfig?.();
  unsubConfig = null;
});

const cover = computed(() => track.value?.coverOriginal ?? track.value?.cover ?? "");
const title = computed(() => track.value?.title ?? "SPlayer-Next");
const artists = computed(() => formatArtists(track.value?.artists) || "暂无播放");

const rootStyle = computed(() => ({
  "--amb-blur": `${config.backgroundBlur}px`,
  "--lp-font-size": `calc(clamp(1.8rem, 6vh, 4.2rem) * ${config.fontScale})`,
  "--lp-color": "#fff",
}));
</script>

<template>
  <div class="ambiance" :class="{ paused: !playing }" :style="rootStyle">
    <div
      class="bg"
      :style="cover ? { backgroundImage: `url(${cover})` } : undefined"
      aria-hidden="true"
    />
    <div class="bg-mask" aria-hidden="true" />

    <div class="stage">
      <!-- 封面 -->
      <div v-if="config.showCover" class="cover-wrap">
        <img v-if="cover" class="cover" :src="cover" alt="" />
        <div v-else class="cover cover-fallback"><span class="cover-note">♪</span></div>
        <div class="meta">
          <div class="title">{{ title }}</div>
          <div class="artists">{{ artists }}</div>
        </div>
      </div>

      <!-- 歌词（lyric-dom 渲染器托管） -->
      <div ref="lyricsEl" class="lyrics-view"></div>
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
  filter: blur(var(--amb-blur, 48px)) saturate(1.3);
  transform: scale(1.15);
  opacity: 0.55;
  transition: background-image 0.6s ease;
}

.bg-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 40%, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.72) 75%);
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
  transition:
    transform 0.6s ease,
    opacity 0.6s ease;
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

.lyrics-view {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 52vw;
  height: 78vh;
  font-weight: 700;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

/* 竖屏 / 窄屏：改为纵向堆叠 */
@media (max-aspect-ratio: 1/1) {
  .stage {
    flex-direction: column;
    gap: 4vh;
  }
  .lyrics-view {
    max-width: 86vw;
    height: 52vh;
  }
  .cover {
    width: min(40vh, 62vw);
    height: min(40vh, 62vw);
  }
}
</style>
