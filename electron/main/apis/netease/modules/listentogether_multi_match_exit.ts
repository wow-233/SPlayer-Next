/** 多人一起听：退出官方多人房间。 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_match_exit: NeteaseModule = (query, request) =>
  request(
    "/api/listen/together/multi/match/exit",
    {
      roomId: String(query.roomId ?? ""),
      exitType: String(query.exitType ?? "NORMAL"),
    },
    createOption(query),
  );

export default listentogether_multi_match_exit;
