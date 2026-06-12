const DATA_URL = "./assets/seed_worldcup.json";
const REMOTE_STATS_URL = "https://raw.giteeusercontent.com/lin-guangbo/worldcup-guide-data/raw/master/worldcup_stats.json";
const FOOTBALL_DATA_CACHE_URL = "./football_data_cache.json";

let state = {
  data: null,
  route: location.hash.replace(/^#/, "") || "home",
  selectedStage: "全部",
  selectedGroup: "A",
  collapsedDays: new Set(),
  collapsedGroups: new Set(),
  expandedGroupRecords: new Set(),
  scrollTopOnRender: true,
  remoteStats: null,
  liveSync: null
};

const app = document.querySelector("#app");

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const asset = (url = "") => {
  if (!url) return "";
  return url.replace("file:///android_asset/", "./assets/");
};

const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item]));
const fmtDate = (iso) => new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date(iso));
const fmtDay = (iso) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replaceAll("/", "-");
const fmtTime = (iso) => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const statusText = (m) => {
  if (m.status === "FINISHED") return "已结束";
  if (m.status === "IN_PLAY" || m.status === "PAUSED") return `${m.liveMinute || ""}' 进行中`;
  return "未开始";
};
const scoreText = (m) => Number.isInteger(m.homeScore) && Number.isInteger(m.awayScore) ? `${m.homeScore} : ${m.awayScore}` : "- : -";

function navigate(route) {
  if (state.route === route) return;
  state.scrollTopOnRender = true;
  state.route = route;
  if (location.hash.replace(/^#/, "") !== route) {
    location.hash = route;
  }
  render();
}

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace(/^#/, "") || "home";
  state.scrollTopOnRender = true;
  render();
});

document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go]");
  if (go) {
    event.preventDefault();
    navigate(go.dataset.go);
    return;
  }

  const group = event.target.closest("[data-group]");
  if (group) {
    state.selectedGroup = group.dataset.group;
    render();
  }

  const groupToggle = event.target.closest("[data-group-toggle]");
  if (groupToggle) {
    const key = groupToggle.dataset.groupToggle;
    state.collapsedGroups.has(key) ? state.collapsedGroups.delete(key) : state.collapsedGroups.add(key);
    render();
  }

  const recordToggle = event.target.closest("[data-record-toggle]");
  if (recordToggle) {
    const key = recordToggle.dataset.recordToggle;
    state.expandedGroupRecords.has(key) ? state.expandedGroupRecords.delete(key) : state.expandedGroupRecords.add(key);
    render();
  }

  const day = event.target.closest("[data-day-toggle]");
  if (day) {
    const key = day.dataset.dayToggle;
    state.collapsedDays.has(key) ? state.collapsedDays.delete(key) : state.collapsedDays.add(key);
    render();
  }

  const dialogClose = event.target.closest("[data-dialog-close]");
  if (dialogClose) document.querySelector(".dialog")?.remove();

  const mystery = event.target.closest("[data-mystery]");
  if (mystery) showMysteryDialog();

  const refreshStats = event.target.closest("[data-refresh-stats]");
  if (refreshStats) refreshRemoteStats();

  const refreshLive = event.target.closest("[data-refresh-live]");
  if (refreshLive) refreshFootballData();
});

document.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.matches("#noteForm")) {
    const text = event.target.elements.note.value.trim();
    if (!text) return;
    const notes = JSON.parse(localStorage.getItem("wc_notes") || "[]");
    notes.unshift({ text, at: new Date().toISOString() });
    localStorage.setItem("wc_notes", JSON.stringify(notes.slice(0, 20)));
    event.target.reset();
    render();
  }
});

async function init() {
  const response = await fetch(DATA_URL);
  const data = await response.json();
  state.data = {
    ...data,
    teamMap: byId(data.teams),
    stadiumMap: byId(data.stadiums)
  };
  state.remoteStats = JSON.parse(localStorage.getItem("wc_remote_stats") || "null");
  state.liveSync = JSON.parse(localStorage.getItem("wc_live_sync") || "null");
  if (state.liveSync?.payload) applyFootballDataPayload(state.liveSync.payload, { persist: false, silent: true });
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function layout(content, options = {}) {
  const back = state.route === "home" ? "" : `<button class="back" data-go="home">‹ 返回首页</button>`;
  return `<main class="page">${back}${content}</main>`;
}

function header(title, subtitle) {
  return `<section class="module-header"><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</section>`;
}

function render() {
  if (!state.data) return;
  const [route, id] = state.route.split("/");
  const views = {
    home: renderHome,
    schedule: renderSchedule,
    teams: renderTeams,
    team: () => renderTeamDetail(id),
    stadiums: renderStadiums,
    stadium: () => renderStadiumDetail(id),
    rankings: renderRankings,
    tools: renderTools,
    settings: renderSettings
  };
  app.innerHTML = (views[route] || renderHome)();
  if (state.scrollTopOnRender) {
    window.scrollTo({ top: 0, behavior: "instant" });
    state.scrollTopOnRender = false;
  }
}

function renderHome() {
  const today = fmtDay(new Date());
  const todayMatches = state.data.matches
    .filter((m) => fmtDay(m.kickoffUtc) === today)
    .sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
  const cards = [
    ["schedule", "📅", "完整赛程", "104 场比赛，按日期查看"],
    ["teams", "👥", "球队积分", "48 支球队和小组表"],
    ["stadiums", "🏟️", "场馆地图", "16 座承办场馆"],
    ["tools", "⚽", "观赛工具", "竞猜、笔记、出线模拟"],
    ["rankings", "🏆", "数据榜", "射手榜和球队榜"],
    ["settings", "⚙️", "设置/说明", "数据延迟与作者信息"]
  ].map(([go, icon, title, text]) => `
    <button class="home-card" data-go="${go}">
      <span class="icon">${icon}</span>
      <span><h3>${title}</h3><p>${text}</p></span>
    </button>
  `).join("");

  return `
    <main class="page">
      <section class="hero">
        <h1 class="hero-title">2026世界杯<br />观赛指南</h1>
        <p class="hero-subtitle">美加墨赛事信息、赛程、球队、场馆和观赛工具</p>
        <div class="stats">
          <div class="stat"><strong>104</strong><span>场比赛</span></div>
          <div class="stat"><strong>48</strong><span>支球队</span></div>
          <div class="stat"><strong>16</strong><span>座场馆</span></div>
        </div>
      </section>
      <div class="grid">${cards}</div>
      <div class="section-title"><h2>今日焦点</h2><small>${fmtDay(new Date())}</small></div>
      <section class="card">
        <h3>${todayMatches.length ? `今日比赛 · ${todayMatches.length}场` : "今日无比赛"}</h3>
        ${todayMatches.length ? todayMatches.map(matchCard).join("") : "<p>可以查看完整赛程、淘汰赛晋级图和球队资料。</p>"}
      </section>
    </main>
  `;
}

function liveSyncCard(description) {
  const sync = state.liveSync;
  const status = sync?.ok
    ? `上次同步成功：${new Date(sync.updatedAt).toLocaleString("zh-CN")}，比赛 ${sync.matchCount || 0} 场，积分 ${sync.standingCount || 0} 队`
    : (sync?.error ? `上次同步失败：${sync.error}` : "当前使用本地赛程数据，点击后尝试从 football-data.org 更新。");
  return `
    <section class="card live-card">
      <div>
        <h3>实时数据更新</h3>
        <p>${description}</p>
        <small>${escapeHtml(status)}</small>
      </div>
      <button class="primary" data-refresh-live>刷新</button>
    </section>
  `;
}

function renderSchedule() {
  const matches = state.data.matches
    .sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
  const grouped = matches.reduce((map, m) => {
    const key = fmtDay(m.kickoffUtc);
    (map[key] ||= []).push(m);
    return map;
  }, {});
  const body = Object.entries(grouped).map(([day, list]) => `
    <section class="match-day">
      <div class="day-head"><div><h3>${day}</h3><span class="muted">${list.length} 场比赛</span></div><button data-day-toggle="${day}">${state.collapsedDays.has(day) ? "展开" : "收起"}</button></div>
      ${state.collapsedDays.has(day) ? "" : list.map(matchCard).join("")}
    </section>
  `).join("");
  return layout(`${header("全部赛程", "小组赛与淘汰赛统一列表展示")}
    ${liveSyncCard("赛程比分会按 football-data.org 可用数据更新")}
    ${body || `<section class="card"><h3>暂无赛程</h3><p>当前筛选没有比赛。</p></section>`}
  `);
}

function matchCard(m) {
  return `
    <article class="match-card">
      <div class="match-meta"><span>${fmtTime(m.kickoffUtc)}</span><span>${matchStageLabel(m)}</span></div>
      <div class="match-main">
        <div class="team-side">
          <img src="${asset(m.homeFlagUrl)}" alt="${m.homeTeamName}" />
          <div><div class="team-name">${m.homeTeamName}</div><div class="rank">${fifaRank(m.homeTeamName)}</div></div>
        </div>
        <div class="scorebox"><strong>${m.status === "SCHEDULED" ? "VS" : scoreText(m)}</strong><span>${statusText(m)}</span></div>
        <div class="team-side away">
          <img src="${asset(m.awayFlagUrl)}" alt="${m.awayTeamName}" />
          <div><div class="team-name">${m.awayTeamName}</div><div class="rank">${fifaRank(m.awayTeamName)}</div></div>
        </div>
      </div>
      <div class="venue">${m.stadiumName} · ${m.city}</div>
    </article>
  `;
}

function matchStageLabel(m) {
  return m.groupName ? `${m.groupName}组 · ${m.stage}` : m.stage;
}

function renderTeams() {
  const groups = [...new Set(state.data.teams.map((t) => t.groupName))].sort();
  const tables = groups.map((g) => {
    const teams = state.data.teams.filter((t) => t.groupName === g).sort(compareTeams);
    const collapsed = state.collapsedGroups.has(g);
    const recordsOpen = state.expandedGroupRecords.has(g);
    const groupMatches = state.data.matches
      .filter((m) => m.groupName === g)
      .sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
    return `
      <section class="table-card">
        <button class="group-title" data-group-toggle="${g}"><span>${g}组</span><span>${collapsed ? "展开" : "收起"}</span></button>
        ${collapsed ? "" : `
          <div class="stand-row header"><span>球队</span><span>胜/平/负</span><span>进/失</span><span>积分</span></div>
          ${teams.map((t, i) => standingRow(t, i + 1)).join("")}
          <button class="ghost record-toggle" data-record-toggle="${g}">${recordsOpen ? "收起战况记录" : "展开战况记录"}</button>
          ${recordsOpen ? `<div class="record-grid">${groupMatches.map(groupRecordCard).join("")}</div>` : ""}
        `}
      </section>
    `;
  }).join("");
  return layout(`${header("球队与小组积分", "48 支球队按 A-L 分组展示")}
    ${liveSyncCard("小组积分会按 football-data.org standings 更新")}
    ${tables}
  `);
}

function groupRecordCard(m) {
  return `
    <div class="record-card">
      <b>${fmtDate(m.kickoffUtc)} ${fmtTime(m.kickoffUtc)}</b>
      <span>${m.homeTeamName} ${scoreText(m)} ${m.awayTeamName}</span>
      <small>${m.stadiumName}</small>
    </div>
  `;
}

function standingRow(t, pos) {
  return `
    <div class="stand-row" data-go="team/${t.id}">
      <div class="team-cell">
        <span class="pos ${pos < 4 ? `top${pos}` : ""}">${pos}</span>
        <img class="flag" src="${asset(t.flagUrl)}" alt="${t.nameZh}" />
        <div class="team-small"><b>${t.nameZh}</b><span>${fifaRank(t.nameZh)}</span></div>
      </div>
      <span>${t.wins}/${t.draws}/${t.losses}</span>
      <span>${t.goalsFor}/${t.goalsAgainst}</span>
      <span class="gold">${t.points}</span>
    </div>
  `;
}

function renderTeamDetail(id) {
  const team = state.data.teamMap[id];
  if (!team) return layout(header("球队不存在", ""));
  const roster = state.data.players.filter((p) => p.teamId === id).sort((a, b) => a.number - b.number);
  return layout(`${header(team.nameZh, team.nameEn)}
    <section class="card">
      <div class="team-cell"><img class="flag" src="${asset(team.flagUrl)}" alt="${team.nameZh}" /><h3>${team.nameZh}</h3></div>
      <p>${team.intro}</p>
      <p><b>${team.history}</b></p>
    </section>
    ${team.squadImageUrl ? `<section class="card"><h3>球队26人大名单</h3><img class="squad-img" src="${asset(team.squadImageUrl)}" alt="${team.nameZh}名单" /><p>本图片为AI生成，仅作为整队名单图展示。</p></section>` : ""}
    <section class="card"><h3>球员名单</h3>${roster.map(playerRow).join("")}</section>
  `);
}

function playerRow(p) {
  const name = p.nameZh && p.nameEn && p.nameZh !== p.nameEn ? `${p.nameZh} / ${p.nameEn}` : (p.nameZh || p.name || p.nameEn);
  return `<div class="player-row"><span class="pos">${p.number}</span><div class="ranking-main"><b>${escapeHtml(name)}</b><span>${p.position} · ${p.club || "俱乐部待更新"}</span></div></div>`;
}

function renderStadiums() {
  return layout(`${header("比赛场馆", "16 座 2026 世界杯承办场馆")}
    ${state.data.stadiums.map((s) => `
      <button class="card stadium-card clickable-card" data-go="stadium/${s.id}" aria-label="查看${s.name}">
        <img src="${asset(s.imageUrl)}" alt="${s.name}" />
        <h3>${s.name}</h3>
        <p>${s.city} · ${s.country}｜容量 ${Number(s.capacity).toLocaleString("zh-CN")} 人</p>
      </button>
    `).join("")}
  `);
}

function renderStadiumDetail(id) {
  const s = state.data.stadiumMap[id];
  if (!s) return layout(header("场馆不存在", ""));
  const matches = state.data.matches.filter((m) => m.stadiumId === id);
  const imgs = (s.imageUrls?.length ? s.imageUrls : [s.imageUrl]).map(asset);
  return layout(`${header(s.name, `${s.city} · ${s.country}`)}
    <section class="card stadium-card">
      ${imgs.map((img) => `<img src="${img}" alt="${s.name}" style="margin-bottom:10px;height:210px" />`).join("")}
      <p>${s.description || ""}</p>
    </section>
    <section class="card"><h3>承办比赛</h3>${matches.map(matchCard).join("")}</section>
  `);
}

function renderRankings() {
  const remote = state.remoteStats;
  const playerStats = remote?.playerStats?.length
    ? remote.playerStats.map((r) => ({ ...state.data.players.find((p) => p.id === r.playerId), ...r })).filter(Boolean)
    : state.data.players;
  const teamStats = remote?.teamStats?.length
    ? remote.teamStats.map((r) => ({ ...state.data.teams.find((t) => t.id === r.teamId), ...r })).filter(Boolean)
    : state.data.teams;
  const scorers = [...playerStats].sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0) || (a.minutes || 9999) - (b.minutes || 9999)).slice(0, 10);
  const assists = [...playerStats].sort((a, b) => (b.assists || 0) - (a.assists || 0) || (b.goals || 0) - (a.goals || 0)).slice(0, 10);
  const teams = [...teamStats].sort((a, b) => (b.goals || b.goalsFor || 0) - (a.goals || a.goalsFor || 0)).slice(0, 10);
  return layout(`${header("数据榜", "支持从 Gitee JSON 手动刷新")}
    <section class="card"><h3>远程数据源</h3><p>${remote ? `已缓存 v${remote.version || 1}，更新时间 ${remote.updatedAt || "未知"}` : "当前使用本地数据。上传 worldcup_stats.json 后可刷新。"}</p><br /><button class="primary" data-refresh-stats>刷新</button></section>
    ${rankingCard("射手榜", scorers, "goals", "球")}
    ${rankingCard("助攻榜", assists, "assists", "助攻")}
    ${teamRankingCard("球队进球榜 / 公平竞赛榜", teams)}
  `);
}

function rankingCard(title, rows, key, unit) {
  return `<section class="card"><h3>${title}</h3>${rows.map((p, i) => {
    const name = p.nameZh && p.nameEn && p.nameZh !== p.nameEn ? `${p.nameZh} / ${p.nameEn}` : (p.nameZh || p.name || p.nameEn || p.playerId);
    return `<div class="ranking-row"><span class="pos ${i < 3 ? `top${i + 1}` : ""}">${i + 1}</span><div class="ranking-main"><b>${escapeHtml(name)}</b><span>${p.position || ""} · ${p.club || ""}</span></div><div class="ranking-num">${p[key] || 0}${unit}</div></div>`;
  }).join("")}</section>`;
}

function teamRankingCard(title, rows) {
  return `<section class="card"><h3>${title}</h3>${rows.map((t, i) => `<div class="ranking-row"><span class="pos ${i < 3 ? `top${i + 1}` : ""}">${i + 1}</span><img class="flag" src="${asset(t.flagUrl)}" /><div class="ranking-main"><b>${t.nameZh}</b><span>净胜球 ${t.goalDifference ?? (t.goalsFor - t.goalsAgainst)} · 积分 ${t.points || 0}</span></div><div class="ranking-num">${t.goals ?? t.goalsFor ?? 0}球<br /><small>黄${t.yellowCards || 0}/红${t.redCards || 0}</small></div></div>`).join("")}</section>`;
}

async function refreshRemoteStats() {
  try {
    const res = await fetch(`${REMOTE_STATS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.remoteStats = json;
    localStorage.setItem("wc_remote_stats", JSON.stringify(json));
  } catch (err) {
    showMessage(`远程数据刷新失败：${err.message}\n\n如果提示 Unexpected token '<'，通常说明远程地址返回的是网页或 404 页面，不是 JSON。需要确认 Gitee 原始数据链接能直接打开 JSON 内容。`);
  } finally {
    render();
  }
}

async function refreshFootballData() {
  try {
    const payload = await fetchFootballDataCache();
    const result = applyFootballDataPayload(payload);
    state.liveSync = {
      ok: true,
      updatedAt: payload.updatedAt || new Date().toISOString(),
      matchCount: result.matchCount,
      standingCount: result.standingCount,
      payload
    };
    localStorage.setItem("wc_live_sync", JSON.stringify(state.liveSync));
  } catch (err) {
    state.liveSync = {
      ok: false,
      updatedAt: new Date().toISOString(),
      error: err.message,
      payload: state.liveSync?.payload || null
    };
    localStorage.setItem("wc_live_sync", JSON.stringify(state.liveSync));
    showMessage(`实时数据刷新失败：${err.message}\n\n网页版通过 GitHub Actions 生成 football_data_cache.json 后再同步。失败时 App 会继续使用本地数据。`);
  } finally {
    render();
  }
}

async function fetchFootballDataCache() {
  const res = await fetch(`${FOOTBALL_DATA_CACHE_URL}?t=${Date.now()}`, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`实时缓存 HTTP ${res.status}`);
  if (text.trim().startsWith("<")) throw new Error("实时缓存还没有生成，请先运行 GitHub Actions");
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("实时缓存不是有效 JSON");
  }
  if (json.error) throw new Error(json.error);
  return json;
}

function applyFootballDataPayload(payload, options = {}) {
  const matchCount = applyFootballMatches(payload.matches || []);
  const standingCount = applyFootballStandings(payload.standings || []);
  refreshMaps();
  if (options.persist !== false) {
    localStorage.setItem("wc_live_sync_payload", JSON.stringify(payload));
  }
  if (!options.silent && (matchCount || standingCount)) {
    showMessage(`实时数据已更新：赛程 ${matchCount} 场，积分 ${standingCount} 支球队。`);
  }
  return { matchCount, standingCount };
}

function applyFootballMatches(apiMatches) {
  let updated = 0;
  for (const apiMatch of apiMatches) {
    const local = findLocalMatch(apiMatch);
    if (!local) continue;
    const score = apiMatch.score?.fullTime || apiMatch.score?.regularTime || {};
    const homeScore = Number.isInteger(score.home) ? score.home : null;
    const awayScore = Number.isInteger(score.away) ? score.away : null;
    local.status = normalizeMatchStatus(apiMatch.status);
    local.homeScore = homeScore;
    local.awayScore = awayScore;
    local.lastSyncedAt = new Date().toISOString();
    local.liveSummary = apiMatch.status || null;
    updated += 1;
  }
  return updated;
}

function applyFootballStandings(apiStandings) {
  let updated = 0;
  for (const standing of apiStandings) {
    for (const row of standing.table || []) {
      const team = findTeamByApi(row.team);
      if (!team) continue;
      team.position = row.position ?? team.position;
      team.played = row.playedGames ?? team.played;
      team.wins = row.won ?? team.wins;
      team.draws = row.draw ?? team.draws;
      team.losses = row.lost ?? team.losses;
      team.goalsFor = row.goalsFor ?? team.goalsFor;
      team.goalsAgainst = row.goalsAgainst ?? team.goalsAgainst;
      team.goalDifference = row.goalDifference ?? (team.goalsFor - team.goalsAgainst);
      team.points = row.points ?? team.points;
      updated += 1;
    }
  }
  return updated;
}

function findLocalMatch(apiMatch) {
  const home = findTeamByApi(apiMatch.homeTeam);
  const away = findTeamByApi(apiMatch.awayTeam);
  if (!home || !away) return null;
  const apiDay = apiMatch.utcDate ? apiMatch.utcDate.slice(0, 10) : "";
  return state.data.matches.find((m) =>
    m.homeTeamId === home.id &&
    m.awayTeamId === away.id &&
    (!apiDay || m.kickoffUtc.slice(0, 10) === apiDay)
  ) || state.data.matches.find((m) =>
    m.homeTeamId === home.id &&
    m.awayTeamId === away.id
  );
}

function findTeamByApi(apiTeam = {}) {
  const names = [apiTeam.name, apiTeam.shortName, apiTeam.tla, apiTeam.crest].filter(Boolean).map(normalizeName);
  return state.data.teams.find((team) => {
    const aliases = teamAliases(team);
    return names.some((name) => aliases.includes(name));
  });
}

function teamAliases(team) {
  return [
    team.nameZh,
    team.nameEn,
    team.nameEn?.replace("United States", "USA"),
    team.nameEn?.replace("Czechia", "Czech Republic"),
    team.nameEn?.replace("Türkiye", "Turkey"),
    team.nameEn?.replace("Ivory Coast", "Côte d'Ivoire"),
    team.nameEn?.replace("DR Congo", "Congo DR"),
    team.nameEn?.replace("DR Congo", "Congo"),
    team.nameEn?.replace("South Korea", "Korea Republic"),
    team.nameEn?.replace("Cape Verde", "Cabo Verde")
  ].filter(Boolean).map(normalizeName);
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function normalizeMatchStatus(status) {
  if (["FINISHED", "AWARDED"].includes(status)) return "FINISHED";
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(status)) return "IN_PLAY";
  return "SCHEDULED";
}

function refreshMaps() {
  state.data.teamMap = byId(state.data.teams);
  state.data.stadiumMap = byId(state.data.stadiums);
}

function renderTools() {
  const groups = [...new Set(state.data.teams.map((t) => t.groupName))].sort();
  const g = state.selectedGroup;
  const groupMatches = state.data.matches.filter((m) => m.groupName === g).slice(0, 6);
  const notes = JSON.parse(localStorage.getItem("wc_notes") || "[]");
  return layout(`${header("观赛工具", "出线模拟、竞猜中心和观赛笔记")}
    <div class="chips">${groups.map((x) => `<button class="chip ${state.selectedGroup === x ? "active" : ""}" data-group="${x}">${x}组</button>`).join("")}</div>
    <section class="card"><h3>${g}组出线模拟器</h3>${groupMatches.map((m) => `<div class="form-grid"><span>${m.homeTeamName} vs ${m.awayTeamName}</span><input inputmode="numeric" placeholder="主" /><input inputmode="numeric" placeholder="客" /></div>`).join("")}<p>网页演示版会保留输入界面，正式排名计算可继续接入。</p></section>
    <section class="card"><h3>竞猜中心</h3><p>${state.data.matches[0].homeTeamName} vs ${state.data.matches[0].awayTeamName}</p><div class="form-grid"><span>比分竞猜</span><input inputmode="numeric" placeholder="主" /><input inputmode="numeric" placeholder="客" /></div><button class="primary">提交竞猜</button></section>
    <section class="card"><h3>观赛笔记</h3><form id="noteForm"><textarea name="note" placeholder="写一条观赛笔记"></textarea><br /><br /><button class="primary">保存笔记</button></form>${notes.map((n) => `<div class="ranking-row"><div class="ranking-main"><b>${escapeHtml(n.text)}</b><span>${new Date(n.at).toLocaleString("zh-CN")}</span></div></div>`).join("")}</section>
  `);
}

function renderSettings() {
  return layout(`${header("设置/说明", "PWA 网页版，无启动视频和通知功能")}
    <section class="card"><h3>离线能力</h3><p>首次打开后会缓存核心页面、数据 JSON 和访问过的图片。iPhone Safari 可通过分享按钮添加到主屏幕。</p></section>
    <section class="card"><h3>数据延迟说明</h3><p>网页优先读取本地缓存，再按需刷新 Gitee JSON 或远程接口。免费接口、文件缓存、网络状态都会造成延迟。说白了，就是用了免费的 API 接口，想白嫖，便宜没好货。</p></section>
    <section class="card"><h3>关于应用</h3><p>作者：Eminem<br />反馈邮箱：379569978@qq.com</p><br /><img class="squad-img" src="./assets/wechat_qr_eminem.png" alt="微信二维码" /></section>
    <section class="card"><h3>趣味内容</h3><button class="primary" data-mystery>世界杯四大玄学</button></section>
  `);
}

function showMysteryDialog() {
  const text = `世界杯至今无人能破四大玄学

玄学一：夺冠球队都是本土主帅
如果继续，今年不是：
英格兰/葡萄牙/比利时/巴西

玄学二：98年扩军后，无队卫冕如果继续，今年不是阿根廷

玄学三：98年扩军后，美洲不连拿如果继续，今年冠军不是美洲球队

玄学四：再黑的黑马也拿不了冠军
如果继续，今年冠军还是传统豪强

如果四大玄学继续
今年冠军就那几只欧洲球队了吧`;
  document.body.insertAdjacentHTML("beforeend", `<div class="dialog"><div class="dialog-card"><h2>世界杯四大玄学</h2><pre>${escapeHtml(text)}</pre><button class="primary" data-dialog-close>知道了</button></div></div>`);
}

function showMessage(message) {
  document.body.insertAdjacentHTML("beforeend", `<div class="dialog"><div class="dialog-card"><h2>提示</h2><p>${escapeHtml(message)}</p><button class="primary" data-dialog-close>知道了</button></div></div>`);
}

function compareTeams(a, b) {
  return (b.points - a.points) || ((b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)) || (b.goalsFor - a.goalsFor);
}

function fifaRank(name) {
  const ranks = {
    "阿根廷": 1,
    "西班牙": 2,
    "法国": 3,
    "英格兰": 4,
    "葡萄牙": 5,
    "巴西": 6,
    "摩洛哥": 7,
    "荷兰": 8,
    "比利时": 9,
    "德国": 10,
    "克罗地亚": 11,
    "哥伦比亚": 13,
    "墨西哥": 14,
    "塞内加尔": 15,
    "乌拉圭": 16,
    "美国": 17,
    "日本": 18,
    "瑞士": 19,
    "伊朗": 20,
    "土耳其": 22,
    "厄瓜多尔": 23,
    "奥地利": 24,
    "韩国": 25,
    "澳大利亚": 27,
    "阿尔及利亚": 28,
    "埃及": 29,
    "加拿大": 30,
    "挪威": 31,
    "科特迪瓦": 33,
    "巴拿马": 34,
    "瑞典": 38,
    "捷克": 40,
    "巴拉圭": 41,
    "苏格兰": 42,
    "突尼斯": 45,
    "刚果民主共和国": 46,
    "乌兹别克斯坦": 50,
    "卡塔尔": 56,
    "伊拉克": 57,
    "南非": 60,
    "沙特阿拉伯": 61,
    "约旦": 63,
    "波黑": 64,
    "佛得角": 67,
    "加纳": 73,
    "库拉索": 82,
    "海地": 83,
    "新西兰": 85
  };
  return ranks[name] ? `排名: ${ranks[name]}位` : "排名: 待更新";
}

init().catch((err) => {
  app.innerHTML = `<main class="page"><section class="card"><h3>加载失败</h3><p>${escapeHtml(err.message)}</p></section></main>`;
});
