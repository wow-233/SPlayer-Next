/** 多人一起听：房间保活并获取当前歌曲、队列和房间状态。 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_heartbeat: NeteaseModule = (query, request) =>
  request(
    "/api/listen/together/multi/match/heartbeat",
    { roomId: String(query.roomId ?? "") },
    createOption(query),
  );

export default listentogether_multi_heartbeat;
