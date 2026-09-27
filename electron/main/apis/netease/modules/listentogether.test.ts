import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Query } from "../core/option";
import type { RequestFn } from "../core/types";
import listentogether_multi_heartbeat from "./listentogether_multi_heartbeat";
import listentogether_multi_match_ack from "./listentogether_multi_match_ack";
import listentogether_multi_match_exit from "./listentogether_multi_match_exit";
import listentogether_multi_room_create from "./listentogether_multi_room_create";
import listentogether_multi_song_operate from "./listentogether_multi_song_operate";
import listentogether_multi_match_msg_history from "./listentogether_multi_match_msg_history";

const createRequest = () => {
  const calls: Array<{ uri: string; data: Record<string, unknown> }> = [];
  const request = (async (uri, data) => {
    calls.push({ uri, data: data as Record<string, unknown> });
    return { status: 200, body: { code: 200 }, cookie: [] };
  }) as RequestFn;
  return { calls, request };
};

describe("网易云官方多人一起听接口", () => {
  it("使用 multi/room/create 建房并序列化数组字段", async () => {
    const { calls, request } = createRequest();
    await listentogether_multi_room_create(
      {
        type: 1,
        songId: 347230,
        playedTime: 1234,
        nextSongIds: [347231, 347232],
        cookie: {},
      } satisfies Query,
      request,
    );
    assert.equal(calls[0]?.uri, "/api/listen/together/multi/room/create");
    assert.deepEqual(calls[0]?.data, {
      type: 1,
      songId: 347230,
      groupIds: "[]",
      inviteUids: "[]",
      from: "CREATE",
      playedTime: 1234,
      nextSongIds: "[347231,347232]",
      checkToken: "",
    });
  });

  it("使用 match/ack 加入并携带 inviterUid", async () => {
    const { calls, request } = createRequest();
    await listentogether_multi_match_ack(
      { roomId: "room-1", inviterUid: "42", cookie: {} } satisfies Query,
      request,
    );
    assert.equal(calls[0]?.uri, "/api/listen/together/multi/match/ack");
    assert.deepEqual(calls[0]?.data, {
      roomId: "room-1",
      checkToken: "",
      agree: true,
      inviterUid: "42",
    });
  });

  it("心跳、歌曲操作和退出均走 multi 协议", async () => {
    const { calls, request } = createRequest();
    await listentogether_multi_heartbeat({ roomId: "room-1", cookie: {} } satisfies Query, request);
    await listentogether_multi_song_operate(
      {
        roomId: "room-1",
        songId: 347230,
        bizId: 0,
        operate: 1,
        cookie: {},
      } satisfies Query,
      request,
    );
    await listentogether_multi_match_exit(
      { roomId: "room-1", cookie: {} } satisfies Query,
      request,
    );
    assert.equal(calls[0]?.uri, "/api/listen/together/multi/match/heartbeat");
    assert.equal(calls[1]?.uri, "/api/listen/together/multi/match/song/operate");
    assert.deepEqual(calls[1]?.data, {
      roomId: "room-1",
      songId: 347230,
      bizId: 0,
      checkToken: "",
      operate: 1,
    });
    assert.equal(calls[2]?.uri, "/api/listen/together/multi/match/exit");
    assert.deepEqual(calls[2]?.data, { roomId: "room-1", exitType: "NORMAL" });
  });

  it("读取房间推荐记录中的逐曲置顶次数", async () => {
    const { calls, request } = createRequest();
    await listentogether_multi_match_msg_history(
      { roomId: "room-1", cookie: {} } satisfies Query,
      request,
    );
    assert.equal(calls[0]?.uri, "/api/listen/together/multi/match/msg/history");
    assert.deepEqual(calls[0]?.data, {
      roomId: "room-1",
      direction: 0,
      page: '{"size":50}',
    });
  });
});
