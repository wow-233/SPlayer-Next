/** 多人一起听：接受邀请并加入官方多人房间。 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_match_ack: NeteaseModule = (query, request) =>
  request(
    "/api/listen/together/multi/match/ack",
    {
      roomId: String(query.roomId ?? ""),
      checkToken: String(query.securityToken ?? ""),
      agree: query.agree !== false,
      inviterUid: String(query.inviterUid ?? query.inviterId ?? "0"),
    },
    createOption(query),
  );

export default listentogether_multi_match_ack;
