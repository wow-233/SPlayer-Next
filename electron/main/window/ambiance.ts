import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createWindow } from "./create";
import { store } from "@main/store";
import { broadcast } from "@main/utils/broadcast";
import { isAppQuitting } from "@main/utils/lifecycle";
import { setTrayAmbiance } from "@main/services/tray";
import { coreLog } from "@main/utils/logger";

let ambianceWindow: BrowserWindow | null = null;

/**
 * 按设置里的 displayMode 选择目标显示器
 * auto 优先副屏（非主屏）；secondary 无副屏时退回主屏
 */
const pickTargetDisplay = (): Electron.Display => {
  const primary = screen.getPrimaryDisplay();
  const secondary = screen.getAllDisplays().find((d) => d.id !== primary.id);
  const mode = store.get("ambiance.displayMode");
  if (mode === "primary") return primary;
  return secondary ?? primary;
};

/** 把窗口铺满目标显示器（无边框 + 真全屏） */
const fitToDisplay = (win: BrowserWindow): void => {
  const display = pickTargetDisplay();
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds(display.bounds);
  win.setFullScreen(true);
  coreLog.info(`[ambiance] fit display id=${display.id} win=${JSON.stringify(win.getBounds())}`);
};

/** 创建副屏氛围屏窗口（无边框、全屏铺满目标显示器） */
export const createAmbianceWindow = (): BrowserWindow => {
  if (ambianceWindow && !ambianceWindow.isDestroyed()) {
    ambianceWindow.show();
    ambianceWindow.focus();
    return ambianceWindow;
  }

  const display = pickTargetDisplay();
  coreLog.info(
    `[ambiance] create display id=${display.id} scale=${display.scaleFactor} mode=${store.get("ambiance.displayMode")}`,
  );
  ambianceWindow = createWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    title: "SPlayer-Next - Ambiance",
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreen: true,
    fullscreenable: true,
    skipTaskbar: true,
    backgroundColor: "#0b0b0f",
    webPreferences: {
      images: true,
      disableDialogs: true,
      zoomFactor: 1.0,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    ambianceWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/windows/ambiance/index.html`);
  } else {
    ambianceWindow.loadFile(join(__dirname, "../renderer/windows/ambiance/index.html"));
  }

  ambianceWindow.webContents.on("did-finish-load", () => {
    if (!ambianceWindow) return;
    ambianceWindow.webContents.setZoomFactor(1.0);
    fitToDisplay(ambianceWindow);
    ambianceWindow.show();
  });

  ambianceWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    coreLog.error(`[ambiance] did-fail-load code=${code} desc=${desc} url=${url}`);
  });

  // ready-to-show 偶发不触发，这里仅作兜底
  ambianceWindow.once("ready-to-show", () => {
    if (!ambianceWindow) return;
    fitToDisplay(ambianceWindow);
    ambianceWindow.show();
  });

  broadcast("ambiance:visibilityChange", true);
  setTrayAmbiance(true);
  store.set("windowStates.ambiance.visible", true);

  ambianceWindow.on("closed", () => {
    ambianceWindow = null;
    setTrayAmbiance(false);
    if (!isAppQuitting()) {
      broadcast("ambiance:visibilityChange", false);
      store.set("windowStates.ambiance.visible", false);
    }
  });

  return ambianceWindow;
};

/** 目标显示器变化时重新铺满（切换主/副屏后调用） */
export const refitAmbianceWindow = (): void => {
  if (ambianceWindow && !ambianceWindow.isDestroyed()) fitToDisplay(ambianceWindow);
};

/** 关闭氛围屏窗口 */
export const closeAmbianceWindow = (): void => {
  if (ambianceWindow && !ambianceWindow.isDestroyed()) ambianceWindow.close();
};

/** 切换氛围屏窗口，返回切换后的可见状态 */
export const toggleAmbianceWindow = (): boolean => {
  if (ambianceWindow && !ambianceWindow.isDestroyed()) {
    closeAmbianceWindow();
    return false;
  }
  createAmbianceWindow();
  return true;
};

/** 获取氛围屏窗口实例 */
export const getAmbianceWindow = (): BrowserWindow | null => {
  if (ambianceWindow && !ambianceWindow.isDestroyed()) return ambianceWindow;
  return null;
};
