/** 读取官方多人房间的歌曲推荐记录，供待播列表显示置顶次数。 */
import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_match_msg_history: NeteaseModule = (query, request) =>
  request(
    "/api/listen/together/multi/match/msg/history",
    {
      roomId: String(query.roomId ?? ""),
      direction: 0,
      page: JSON.stringify({ size: 50 }),
    },
    createOption(query),
  );

export default listentogether_multi_match_msg_history;
