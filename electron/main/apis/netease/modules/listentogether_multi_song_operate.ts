/**
 * 多人一起听：歌曲操作。
 * operate: 1 推歌，2 置顶，4 切歌（官方 LTMultiSongOperateType）。
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_song_operate: NeteaseModule = (query, request) =>
  request(
    "/api/listen/together/multi/match/song/operate",
    {
      roomId: String(query.roomId ?? ""),
      songId: Number(query.songId ?? 0),
      bizId: Number(query.bizId ?? 0),
      checkToken: String(query.securityToken ?? ""),
      operate: Number(query.operate ?? 1),
    },
    createOption(query),
  );

export default listentogether_multi_song_operate;
