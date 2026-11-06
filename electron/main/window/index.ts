import { store } from "@main/store";
import { isWin } from "@main/utils/config";
import { createDesktopLyricWindow } from "./desktopLyric";
import { createDynamicIslandWindow } from "./dynamicIsland";
import { createTaskbarLyricWindow } from "./taskbarLyric";
import { createAmbianceWindow } from "./ambiance";

export { createWindow } from "./create";
export {
  createMainWindow,
  getMainWindow,
  focusMainWindow,
  showReadyMainWindow,
  setTaskbarProgress,
  applyMainWindowZoom,
  minimizeMainWindow,
  toggleMaximizeMainWindow,
  isMainWindowMaximized,
  toggleFullscreenMainWindow,
  isMainWindowFullscreen,
  hideMainWindow,
} from "./main";
export {
  createDesktopLyricWindow,
  closeDesktopLyricWindow,
  toggleDesktopLyricWindow,
  getDesktopLyricWindow,
  applyDesktopLyricLock,
  applyDesktopLyricAlwaysOnTop,
  applyDesktopLyricUnlockButtonBounds,
  applyDesktopLyricHeight,
  moveDesktopLyricWindow,
  saveDesktopLyricState,
} from "./desktopLyric";
export {
  createDynamicIslandWindow,
  closeDynamicIslandWindow,
  toggleDynamicIslandWindow,
  getDynamicIslandWindow,
  applyDynamicIslandAlwaysOnTop,
  applyDynamicIslandHeight,
  applyDynamicIslandShape,
  applyDynamicIslandWidth,
  applyDynamicIslandSnapCentered,
  applyDynamicIslandNotchFusion,
  applyDynamicIslandNonOcclusive,
  toggleDynamicIslandClickThrough,
  moveDynamicIslandWindow,
  saveDynamicIslandState,
} from "./dynamicIsland";
export {
  createTaskbarLyricWindow,
  closeTaskbarLyricWindow,
  toggleTaskbarLyricWindow,
  getTaskbarLyricWindow,
  applyTaskbarLyricLayout,
  updateTaskbarLyricContentWidth,
} from "./taskbarLyric";
export {
  createAmbianceWindow,
  closeAmbianceWindow,
  toggleAmbianceWindow,
  getAmbianceWindow,
  refitAmbianceWindow,
} from "./ambiance";

/** 恢复歌词相关窗口 */
export const restoreLyricWindows = (): void => {
  if (store.get("windowStates.desktopLyric.visible")) createDesktopLyricWindow();
  if (store.get("windowStates.dynamicIsland.visible")) createDynamicIslandWindow();
  if (isWin && store.get("windowStates.taskbarLyric.visible")) {
    createTaskbarLyricWindow();
  }
  if (store.get("windowStates.ambiance.visible")) createAmbianceWindow();
};
