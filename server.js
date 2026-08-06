/* 聚优惠 · 本地后端（双模 fallback）
 * 零依赖：仅用 Node 内置 http / https / fs / path / url
 * 职责：
 *   1) 托管 index.html（http://localhost:3000）
 *   2) GET  /api/health  -> {ok:true}   供前端探测后端是否就绪
 *   3) POST /api/search  -> 服务端代理 Firecrawl + agnes（规避浏览器 file:// 跨域限制）
 * 纯前端若因 CORS / file:// 走不通，前端自动切到本模式。
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* ---- 内置 Key（与前端一致，免配置；可被前端请求体 keys 覆盖）---- */
const FIRECRAWL_KEY = "fc-3d22bb5df55f4a5f96ac29099fe87b0d";
const AGNES_KEY     = "sk-1XjIeWT76KIfwqquWd2lU7Xtbe6Ny0oSzfWsf5JaT4jCPE78";
const AGNES_BASE    = "https://apihub.agnes-ai.cn/v1";
const AGNES_MODEL   = "agnes-2.5-flash";

/* ---- AnySearch（第一备用搜索引擎/抽取，云端免费，匿名可用，无需本地CLI）---- */
const ANYSEARCH_ENDPOINT = "https://api.anysearch.com/mcp";
const ANYSEARCH_KEY      = ""; // 留空=匿名（限速）；可在 https://anysearch.com/console/api-keys 申请免费 Key 后填入

/* ---- Wigolo 本地搜索引擎（主选，本地部署无API成本）---- */
const WIGOLO_ENDPOINT = "http://localhost:3333/v1/search";
const WIGOLO_TIMEOUT = 1500; // 主搜索引擎超时阈值

const { spawn } = require("child_process");

/* ---- 硬超时包装：慢源快速放弃，避免整次搜索被拖死 ---- */
function hardTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);
}

/* ---- 三层爬虫 CLI 探测（启动时检测一次并缓存）---- */
const CLI_CACHE = {};
function whichCli(cmd) {
  if (cmd in CLI_CACHE) return CLI_CACHE[cmd];
  try {
    const isWin = process.platform === "win32";
    const r = require("child_process").spawnSync(isWin ? "where" : "which", [cmd], { encoding: "utf8", timeout: 5000 });
    CLI_CACHE[cmd] = r.status === 0 && r.stdout.trim().length > 0;
  } catch (e) { CLI_CACHE[cmd] = false; }
  return CLI_CACHE[cmd];
}

/* 用子进程跑 CLI，捕获 stdout，带超时 */
function runCli(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    let out = "", done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let proc;
    try { proc = spawn(cmd, args, { shell: process.platform === "win32" }); }
    catch (e) { return finish(null); }
    const t = setTimeout(() => { try { proc.kill(); } catch (e) {} finish(null); }, timeoutMs);
    proc.stdout.on("data", (c) => (out += c));
    proc.stderr.on("data", () => {});
    proc.on("error", () => { clearTimeout(t); finish(null); });
    proc.on("close", () => { clearTimeout(t); finish(out || null); });
  });
}

/* ② 备用：BrowserAct（破反爬/验证码，stealth-extract 抓 URL 正文） */
async function browserActExtract(targetUrl) {
  if (!whichCli("browser-act")) return null;
  const out = await runCli("browser-act", ["stealth-extract", targetUrl], 60000);
  if (!out) return null;
  // 输出可能是 JSON（{markdown|content|text}）或直接文本
  try {
    const j = JSON.parse(out);
    const txt = j.markdown || j.content || j.text || j.data || "";
    if (typeof txt === "string" && txt.length > 200) return txt;
  } catch (e) {}
  return out.length > 200 ? out : null;
}

/* ③ 备用：OpenCLI（登录态全量库，按关键词抓平台优惠，输出 JSON 数组） */
async function opencliExtract(query) {
  // 优先本地适配器 clis/juyouhui/search.js
  const adapter = path.join(ROOT, "clis", "juyouhui", "search.js");
  let out = null;
  if (fs.existsSync(adapter)) {
    out = await runCli(process.execPath, [adapter, query, "-f", "json"], 90000);
  }
  if (!out && whichCli("opencli")) {
    out = await runCli("opencli", ["juyouhui", "search", query, "-f", "json"], 90000);
  }
  if (!out) return [];
  try {
    const j = JSON.parse(out);
    return Array.isArray(j) ? j : (j.deals || j.items || []);
  } catch (e) { return []; }
}

/* ---- HTTPS POST 工具 ---- */
function httpsPostJson(targetUrl, payload, headers, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const u = new url.URL(targetUrl);
    const data = JSON.stringify(payload);
    const opt = {
      method: "POST",
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers),
    };
    const req = https.request(opt, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.write(data);
    req.end();
  });
}

/* ---- 免费层：直接HTTP抓取公开页面（不依赖Firecrawl）---- */
function directFetch(url, ms) {
  return new Promise((res, rej) => {
    let u;
    try { u = new url.URL(url); } catch (e) { return res(null); }
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.get(u, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    }, (resp) => {
      // 跟随重定向（最多3次）
      if ([301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location) {
        resp.destroy();
        return res(directFetch(resp.headers.location, ms));
      }
      // 非2xx视为失败
      if (resp.statusCode < 200 || resp.statusCode >= 400) { resp.resume(); return res(null); }
      let b = "";
      resp.on("data", (c) => b += c);
      resp.on("end", () => res(b || null));
    });
    req.on("error", () => res(null));
    req.setTimeout(ms || 15000, () => { req.destroy(); res(null); });
  });
}

/* HTML→纯文本（保留搜索结果文字内容） */
function htmlToText(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

/* ---- 免费层：优惠聚合站直抓（无需API Key） ---- */
async function bingDirectFetch(queryStr) {
  const sites = [
    {url:`https://search.smzdm.com/?s=${encodeURIComponent(queryStr)}&post_result=0`,name:"什么值得买"},
    {url:`https://www.zhe800.com/search?keyword=${encodeURIComponent(queryStr)}`,name:"折800"},
    {url:`https://www.fanli.com/search?keyword=${encodeURIComponent(queryStr)}`,name:"返利网"},
    {url:`https://www.bing.com/search?q=${encodeURIComponent(queryStr+" 优惠券 团购 代金券")}&count=50`,name:"Bing搜索"}
  ];
  for (const site of sites) {
    const raw = await directFetch(site.url, 20000);
    if (!raw || raw.length < 500) continue;
    const txt = htmlToText(raw);
    if (txt.length > 800) return {text: txt, source: site.name};
  }
  return null;
}

/* ---- 免费层：Agnes知识生成（完全不依赖外部数据源，用LLM训练数据生成优惠）---- */
async function agnesKnowledgeGenerate(category, city, county, keys) {
  const akey = (keys && keys.agnes) || AGNES_KEY;
  const abase = (keys && keys.agnesBase) || AGNES_BASE;
  const amodel = (keys && keys.agnesModel) || AGNES_MODEL;
  const area = county ? `${city}${county}` : city;
  const systemPrompt = `你是优惠信息聚合助手。用户在「${area}」搜索「${category}」相关优惠。
请根据你的知识库，列出当前可能有效、普遍适用的${category}类优惠券/团购/活动/满减信息。
只输出JSON：{"deals":[{"title":"优惠标题","amount":"力度(如 满30减15 / 9.9元 / 第二杯半价)","merchant":"商家或品牌名","category":"${category}","source":"来源平台(须具体到『美团App』『抖音团购』『招商银行信用卡』等，便于跳转领取)","valid_until":"大概有效期或空","link":"","address":"${area}各门店"}]}
规则：
1) 优先全国性连锁品牌的通用优惠（餐饮选蜜雪冰城/茶百道/古茗/喜茶/CoCo/海底捞等；加油选中石化/中石油/壳牌等；超市选永辉/大润发/沃尔玛等）；
2) 包括主流银行信用卡优惠（招商/工商/建设/农业/中国银行的餐饮/加油/超市满减活动）；
3) 包括云闪付、美团、抖音团购等平台的通用券；
4) 力度要合理真实（不要编造"满100减99"这种夸张的），写常见的实际力度；
5) 地址统一写「${area}各门店」或具体商圈名；
6) link 字段【必须为空字符串""】，严禁编造任何 http 链接（含商家官网首页），系统会据 source 自动生成官方领取入口；
7) 不要解释，只输出JSON。`;
  try {
    const r = await httpsPostJson(
      `${abase}/chat/completions`,
      { model: amodel, temperature: 0.25, max_tokens: 3000,
        messages: [{ role: "system", content: systemPrompt },
                   { role: "user", content: `请生成${area}地区的${category}相关优惠，6-12条。` }] },
      { Authorization: "Bearer " + akey },
      50000
    );
    if (r.status !== 200) return [];
    const j = JSON.parse(r.body);
    const content = j.choices?.[0]?.message?.content || "";
    const jsonStr = extractJsonFromFences(content);
    if (!jsonStr) return [];
    const p = JSON.parse(jsonStr);
    const deals = Array.isArray(p) ? p : p.deals || [];
    // 标记为知识生成
    deals.forEach(d => { d._knowledge = true; });
    return deals;
  } catch (e) { return []; }
}

/* ---- ① 主选：Firecrawl 抓取 ---- */
async function firecrawlScrape(targetUrl, keys) {
  const key = (keys && keys.firecrawl) || FIRECRAWL_KEY;
  const r = await httpsPostJson(
    "https://api.firecrawl.dev/v1/scrape",
    { url: targetUrl, formats: ["markdown"], onlyMainContent: false, waitFor: 3000 },
    { Authorization: "Bearer " + key },
    35000
  );
  if (r.status !== 200) return null;
  try { const j = JSON.parse(r.body); return (j.data && j.data.markdown) || null; }
  catch (e) { return null; }
}

/* ---- ① 真·关键词搜索：Firecrawl /v1/search（地区+品种 → 结构化结果） ---- */
async function firecrawlSearch(query, keys) {
  const key = (keys && keys.firecrawl) || FIRECRAWL_KEY;
  const r = await httpsPostJson(
    "https://api.firecrawl.dev/v1/search",
    { query, limit: 10, lang: "zh", country: "CN" },
    { Authorization: "Bearer " + key },
    35000
  );
  if (r.status !== 200) return [];
  try { const j = JSON.parse(r.body); return Array.isArray(j.data) ? j.data : []; }
  catch (e) { return []; }
}

/* ---- ① 第一备用：AnySearch（云端统一搜索/抽取，免 API Key 可匿名用）---- */
async function anysearchCall(toolName, arguments_, keys) {
  const key = (keys && keys.anysearch) || ANYSEARCH_KEY;
  const headers = { "X-Anysearch-Client": "skill/3.0.1" };
  if (key) headers["Authorization"] = "Bearer " + key;
  const r = await httpsPostJson(
    ANYSEARCH_ENDPOINT,
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: arguments_ } },
    headers,
    30000
  );
  if (r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body);
    if (j.error) return null;
    const content = (j.result && j.result.content) || [];
    for (const item of content) if (item.type === "text") return item.text;
    return null;
  } catch (e) { return null; }
}
async function anysearchSearch(query, keys) {
  return (await anysearchCall("search", { query, max_results: 10 }, keys)) || null;
}
async function anysearchExtract(targetUrl, keys) {
  return (await anysearchCall("extract", { url: targetUrl }, keys)) || null;
}

/* ---- agnes 抽取 ---- */
function extractJsonFromFences(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const obj = raw.match(/\{[\s\S]*\}/); if (obj) return obj[0];
  const arr = raw.match(/\[[\s\S]*\]/); if (arr) return arr[0];
  return null;
}
async function agnesExtract(text, sourceName, category, city, keys, kws) {
  const akey = (keys && keys.agnes) || AGNES_KEY;
  const abase = (keys && keys.agnesBase) || AGNES_BASE;
  const amodel = (keys && keys.agnesModel) || AGNES_MODEL;
  const kwList = (Array.isArray(kws) && kws.length ? kws.join("、") : category);
  const system = `你是优惠信息抽取器。从给定文本（重点来自「${sourceName}」搜索结果）中抽取优惠/折扣/券/活动信息。
只输出 JSON，结构：{"deals":[{"title":"优惠标题","amount":"力度如 '满50减18' 或 '5折' 或 '省¥13' 或 '立减XX'","merchant":"商家或品牌名","category":"${category}","source":"真实来源平台名","valid_until":"有效期或空","link":"领券/购买/活动链接(http开头)或空","address":"门店地址或空"}]}。
规则：
1) 文本是搜索引擎结果页（Bing/Google等），优惠信息散落在各条搜索结果的标题/摘要中，请仔细逐条扫描；
2) 力度要忠实原文，不要编造；常见的力度表述包括但不限于：满X减Y、X折、立减X、省¥X、第X件X折、X元起、免费、买一送一等；
3) 链接必须【严格】来自文本中出现的「链接：xxx」原文，以 http 开头才保留；文本中没有链接就填""空字符串；【严禁】凭记忆编造任何 http 链接（含商家官网首页、平台首页），编造链接是严重错误，系统会兜底处理；
4) 【硬性】只保留与「${category}」直接相关的优惠——判断标准：标题或商家或内容须命中这些词之一【${kwList}】；凡是与「${category}」无关的（例如搜"火锅"却出现外卖/餐饮/奶茶/电影票等），一律丢弃，绝不输出；
5) 地域上优先「${city}（或全国/线上可售）」；
6) 即使是搜索结果摘要中的片段信息也可以抽取，不一定需要完整详情；
7) 不要解释，只输出JSON。`;
  const r = await httpsPostJson(
    `${abase}/chat/completions`,
    { model: amodel, temperature: 0.1, max_tokens: 3000,
      messages: [{ role: "system", content: system }, { role: "user", content: `重点来源平台：${sourceName}\n城市：${city}\n待抽取文本：\n${text.slice(0, 12000)}` }] },
    { Authorization: "Bearer " + akey },
    50000
  );
  if (r.status !== 200) return [];
  try {
    const j = JSON.parse(r.body);
    const content = j.choices?.[0]?.message?.content || "";
    const jsonStr = extractJsonFromFences(content);
    if (!jsonStr) return [];
    const p = JSON.parse(jsonStr);
    return Array.isArray(p) ? p : p.deals || [];
  } catch (e) { return []; }
}

/* ---- 核验流水线（与前端一致）---- */
function daysLeft(v) { if (!v) return null; const d = new Date(v); if (isNaN(d)) return null; return Math.ceil((d - Date.now()) / 86400000); }
function scoreConfidence(d, hasLink) {
  let s = 50;
  if (d.title && d.title.length > 3) s += 15;
  if (d.amount && d.amount.length > 1) s += 20;
  if (d.merchant) s += 10;
  if (hasLink) s += 15; else s -= 10;
  const dl = daysLeft(d.valid_until);
  if (dl !== null) s += dl > 0 ? 5 : -25;
  return Math.max(0, Math.min(100, s));
}
/* 链接解析：真实原文链接→直达；无链接→按来源平台构造真实可点的官方入口/搜券页，绝不编造假链接 */
function resolveLink(d, term) {
  const raw = (d.link || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    return { link: raw.replace(/\/$/, ""), type: "direct", ok: true };
  }
  const src = ((d.source || "") + " " + (d.merchant || "")).toLowerCase();
  const PLATFORMS = [
    ["美团","https://www.meituan.com/"],["大众点评","https://www.dianping.com/"],
    ["抖音","https://www.douyin.com/"],["饿了么","https://www.ele.me/"],
    ["云闪付","https://www.95516.com/"],["淘宝","https://www.taobao.com/"],
    ["天猫","https://www.tmall.com/"],["京东","https://www.jd.com/"],
    ["拼多多","https://mobile.yangkeduo.com/"],["小红书","https://www.xiaohongshu.com/"],
    ["招商银行","https://www.cmbchina.com/"],["工商银行","https://www.icbc.com.cn/"],
    ["建设银行","https://www.ccb.com/"],["农业银行","https://www.abchina.com/"],
    ["中国银行","https://www.boc.cn/"],["交通银行","https://www.bankcomm.com/"],
    ["邮储","https://www.psbc.com/"],["浦发银行","https://www.spdb.com.cn/"],
    ["平安银行","https://bank.pingan.com/"],["中信银行","https://www.citicbank.com/"],
    ["兴业银行","https://www.cib.com.cn/"],["民生银行","https://www.cmbc.com.cn/"],
    ["光大银行","https://www.cebbank.com/"],["华夏银行","https://www.hxb.com.cn/"],
    ["广发银行","https://www.cgbchina.com.cn/"],["北京银行","https://www.bankofbeijing.com.cn/"],
    ["瑞幸","https://www.luckincoffee.com/"],["麦当劳","https://www.mcdonalds.com.cn/"],
    ["肯德基","https://www.kfc.com.cn/"],["星巴克","https://www.starbucks.com.cn/"],
    ["蜜雪冰城","https://www.mxbc.com/"],["茶百道","https://www.chabaidao.com/"],
    ["古茗","https://www.guming.com.cn/"],["喜茶","https://www.heytea.com/"],
    ["海底捞","https://www.haidilao.com/"],["永辉","https://www.yonghui.com.cn/"],
    ["大润发","https://www.rt-mart.com/"],["沃尔玛","https://www.walmart.com.cn/"]
  ];
  for (const kv of PLATFORMS) { if (src.indexOf(kv[0].toLowerCase()) >= 0) return { link: kv[1], type: "platform", ok: false }; }
  const q = ((d.merchant || "") + " " + (term || "") + " 优惠券 领取 活动").trim();
  return { link: "https://www.bing.com/search?q=" + encodeURIComponent(q), type: "search", ok: false };
}
function verifyDeals(deals, source, term) {
  const seenT = new Set(), seenL = new Set(), out = [];
  for (const d of deals) {
    const rl = resolveLink(d, term || "");
    const link = rl.link, linkType = rl.type, hasLink = rl.ok;
    const conf = scoreConfidence(d, hasLink);
    const tk = (d.title || "").slice(0, 16).trim();
    const lk = link.replace(/\/$/, "");
    if (tk && seenT.has(tk)) continue;
    if (lk && seenL.has(lk)) continue;
    if (tk) seenT.add(tk);
    if (lk) seenL.add(lk);
    out.push({
      title: d.title || "", amount: d.amount || "", merchant: d.merchant || "",
      category: d.category || "", source: d.source || source || "",
      valid_until: d.valid_until || "", link: link, link_type: linkType, address: d.address || "",
      link_ok: hasLink, confidence: conf, days_left: daysLeft(d.valid_until),
    });
  }
  return out;
}

/* ---- 单源执行：Wigolo主选 → Bing直抓 → AnySearch备用 → Firecrawl付费 ---- */
async function scrapeOneWithFallback(q, keys) {
  // ===== type="search"：关键词搜索 =====
  if (q.type === "search") {
    // 主选：Wigolo 本地搜索引擎（快速、可靠、无API成本）
    const wigoItems = await hardTimeout(wigoloSearch(q.query, keys).catch(() => []), WIGOLO_TIMEOUT + 500, []);
    if (wigoItems && wigoItems.length > 0) {
      const text = wigoItems.map(it => `标题：${it.title || ""}\n摘要：${it.description || ""}\n链接：${it.url || ""}`).join("\n\n");
      return { text, source: q.name, engine: "wigolo-search" };
    }

    // 免费层②：Bing直抓搜索引擎结果（无需API Key）
    const bingText = await hardTimeout(bingDirectFetch(q.query).catch(() => null), 25000, null);
    if (bingText) return { text: bingText.text, source: bingText.source, engine: "bing-direct" };

    // 备用③：AnySearch 通用搜索（云端免费，匿名可用，无需安装本地CLI）
    const asText = await hardTimeout(anysearchSearch(q.query, keys).catch(() => null), 30000, null);
    if (asText) return { text: asText, source: "AnySearch", engine: "anysearch-search" };

    // 付费层④：Firecrawl /v1/search（需要额度）
    const fcItems = await firecrawlSearch(q.query, keys).catch(() => []);
    if (fcItems.length) {
      const text = fcItems.map(it => `标题：${it.title || ""}\n摘要：${it.description || ""}\n链接：${it.url || ""}`).join("\n\n");
      return { text, engine: "firecrawl-search" };
    }
    return null;
  }

  // ===== type="scrape"：抓取指定URL =====
  // 免费层①：直接HTTP抓取
  let md = await hardTimeout(directFetch(q.url).then(raw => raw ? htmlToText(raw) : null).catch(() => null), 20000, null);
  if (md && md.length > 300) return { text: md, engine: "direct-fetch" };

  // 第一备用②：AnySearch extract（URL 全文抽取转 Markdown，云端免费，匿名可用，无需本地CLI）
  md = await hardTimeout(anysearchExtract(q.url, keys).catch(() => null), 30000, null);
  if (md && md.length > 200) return { text: md, engine: "anysearch-extract" };

  // 付费层③：Firecrawl /v1/scrape
  md = await hardTimeout(firecrawlScrape(q.url, keys).catch(() => null), 40000, null);
  if (md && md.length > 200) return { text: md, engine: "firecrawl" };

  // 付费层③：BrowserAct
  md = await hardTimeout(browserActExtract(q.url).catch(() => null), 65000, null);
  if (md && md.length > 200) return { text: md, engine: "browseract" };

  return null;
}

/* ---- 地域标注 + 本地优先排序 ---- */
function regionLevelOf(d, city, county) {
  const blob = ((d.title || "") + " " + (d.merchant || "") + " " + (d.address || "") + " " + (d.source || ""));
  const cityCore = (city || "").replace(/(市|区|县|盟|州|地区)$/, "");
  const countyCore = (county || "").replace(/(市|区|县|盟|州|地区)$/, "");
  if (countyCore && blob.includes(countyCore)) return 2;
  if (cityCore && blob.includes(cityCore)) return 1;
  return 0;
}
function tagAndSortRegion(deals, city, county) {
  deals.forEach(d => {
    d.regionLevel = regionLevelOf(d, city, county);
    d.regionLabel = d.regionLevel === 2 ? "本县" : d.regionLevel === 1 ? "本市" : (city && city !== "全国" ? "全国可享" : "全国");
  });
  deals.sort((a, b) => (b.regionLevel - a.regionLevel) || (b.confidence - a.confidence));
  return deals;
}

/* ---- 搜索主流程（并行 + 全局兜底） ---- */
async function doSearch(payload) {
  const city = payload.city || "全国";
  const county = payload.county || "";
  const category = payload.category || "餐饮美食";
  const queries = Array.isArray(payload.queries) ? payload.queries : [];
  const keys = payload.keys || {};
  const kws = Array.isArray(payload.kws) ? payload.kws : [];
  const enginesUsed = new Set();

  // fallback 查询（全国可享）仅当地域主搜结果不足时补充，避免主动扩大范围
  const primary = queries.filter(q => !q.fallback);
  const fb = queries.filter(q => q.fallback);
  async function runQuery(q) {
    try {
      const scraped = await scrapeOneWithFallback(q, keys);
      if (!scraped) return [];
      enginesUsed.add(scraped.engine);
      const deals = await hardTimeout(
        agnesExtract(scraped.text, q.name, category, city, keys, kws).catch(() => []),
        55000, []
      );
      return verifyDeals(deals, q.name, category);
    } catch (e) { return []; }
  }
  let raw = (await Promise.all(primary.map(runQuery))).reduce((a, b) => a.concat(b), []);
  if (raw.length < 3 && fb.length) {
    raw = raw.concat((await Promise.all(fb.map(runQuery))).reduce((a, b) => a.concat(b), []));
  }

  // ③ 若所有数据源颗粒无收，Agnes知识生成兜底（用LLM训练数据生成合理优惠）
  if (raw.length === 0) {
    const knowledgeDeals = await hardTimeout(agnesKnowledgeGenerate(category, city, county, keys).catch(() => []), 55000, []);
    if (knowledgeDeals.length) { enginesUsed.add("agnes-knowledge"); raw = raw.concat(verifyDeals(knowledgeDeals, "AI知识库", category)); }
  }

  // ④ OpenCLI 登录态兜底（如果用户装了的话）
  if (raw.length === 0) {
    const variants = [`${category}优惠`, `${category}团购券`, `${category}满减 立减`];
    for (const qv of variants) {
      const cliDeals = await hardTimeout(opencliExtract(qv).catch(() => []), 40000, []);
      if (cliDeals.length) { enginesUsed.add("opencli"); raw = raw.concat(verifyDeals(cliDeals, "OpenCLI", category)); break; }
    }
  }

  // 后置过滤：结果多时严格按关键词过滤；结果少时放宽（避免小城市全无）
  // 关键修复：kws 为空数组时不能用来过滤（空数组 .some() 永远 false，会把全部结果清空），
  // 此时回退到品类(category)作为兜底关键词，保证中文/无关键词场景也能出结果。
  const filterKws = (Array.isArray(kws) && kws.length) ? kws : [category];
  if (raw.length > 3) {
    raw = raw.filter(d => {
      const blob = ((d.title || "") + " " + (d.merchant || "") + " " + (d.category || "") + " " + (d.source || ""));
      return filterKws.some(k => k && blob.includes(k));
    });
  }
  // 地域标注 + 本地优先排序
  raw = tagAndSortRegion(raw, city, county);
  return { deals: raw, engines: Array.from(enginesUsed) };
}

/* ---- 静态托管 ---- */
const MIME = { ".html":"text/html; charset=utf-8", ".js":"application/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png", ".ico":"image/x-icon" };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
    res.writeHead(404); res.end("404"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
}

/* ---- 路由 ---- */
const server = http.createServer(async (req, res) => {
  const u = new url.URL(req.url, `http://localhost:${PORT}`);
  // CORS：允许前端（含 file:// 页面）调用
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (u.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, mode: "backend" }));
    return;
  }
  if (u.pathname === "/api/search" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        // 全局硬上限 135s：给 OpenCLI 兜底留时间，无论如何在此前返回，避免前端 AbortError
        const result = await hardTimeout(doSearch(payload), 135000, null);
        if (result === null) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ deals: [], engines: [], timeout: true }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ deals: result.deals, engines: result.engines }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`聚优惠本地服务已启动：http://localhost:${PORT}`);
});
