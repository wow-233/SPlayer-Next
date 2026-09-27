/**
 * 多人一起听：创建官方多人房间。
 *
 * 参数与 Android 官方客户端 9.3.85 的
 * listen/together/multi/room/create 请求保持一致。
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const jsonArray = (value: unknown): string => {
  if (typeof value === "string") return value || "[]";
  return JSON.stringify(Array.isArray(value) ? value : []);
};

const listentogether_multi_room_create: NeteaseModule = (query, request) => {
  const data: Record<string, unknown> = {
    type: Number(query.type ?? 1),
    songId: Number(query.songId ?? 0),
    groupIds: jsonArray(query.groupIds),
    inviteUids: jsonArray(query.inviteUids),
    from: String(query.from ?? "CREATE"),
    playedTime: Number(query.playedTime ?? 0),
    nextSongIds: jsonArray(query.nextSongIds),
    checkToken: String(query.securityToken ?? ""),
  };

  const autoJoinUids = Array.isArray(query.autoJoinUids) ? query.autoJoinUids : [];
  if (autoJoinUids.length) data.autoJoinUids = JSON.stringify(autoJoinUids);
  if (query.artistId) data.artistId = String(query.artistId);
  if (query.playlistIds) data.playlistIds = String(query.playlistIds);

  return request("/api/listen/together/multi/room/create", data, createOption(query));
};

export default listentogether_multi_room_create;
