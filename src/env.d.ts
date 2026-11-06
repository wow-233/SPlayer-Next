/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

declare const __APP_VERSION__: string;
declare const __APP_REPO_URL__: string;
declare const __APP_REPO_NAME__: string;
declare const __APP_AUTHOR__: string;
declare const __APP_HOMEPAGE__: string;
declare const __APP_AUTHOR_URL__: string;
declare const __COMMIT_HASH__: string;
declare const __COMMIT_DATE__: string;
/** 自用 fork 构建标记：不参与在线更新 */
declare const __IS_FORK_BUILD__: boolean;
/** 官方同步基线：HEAD 与 origin/dev 的 merge-base 提交日期（ISO） */
declare const __SYNC_BASE_DATE__: string;
