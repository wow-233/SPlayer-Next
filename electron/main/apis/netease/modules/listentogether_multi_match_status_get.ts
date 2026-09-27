/** 读取官方多人房间的实时成员信息。 */
import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const listentogether_multi_match_status_get: NeteaseModule = (query, request) =>
  request("/api/listen/together/multi/match/status/get", {}, createOption(query));

export default listentogether_multi_match_status_get;
