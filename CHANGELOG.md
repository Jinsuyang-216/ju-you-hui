# 更新日志

## v1.0.7 - 2026-08-12

### 修复（纯前端"双击即用"真正可用 —— 2026-08-13 实测定位）
- **纯前端引擎全部失效根因**：① Firecrawl 前端仍带已耗尽 key（402）② 抽取依赖 Agnes，而 Agnes API **无 CORS 响应头** → 浏览器直连被拦截 → 纯网页版（双击 index.html / 手机）必然空白
- **修复：Firecrawl 免 key 免费层直连**——实测 `/v1/search` 无 key 返回 200 + `Access-Control-Allow-Origin: *`，浏览器直连可用（限速）→ 前端 `firecrawlSearch/firecrawlScrape` 移除 key
- **结构化结果直出卡片**：Firecrawl search 返回 title/url/description 结构化数据，前端直接生成优惠卡片（**不再依赖 Agnes 抽取**，绕开 CORS 死结）
- **引擎顺序调整（纯前端）**：Wigolo（本地，未装自动跳过）→ **Firecrawl 免 key（主选，结构化直出）** → Bing 直抓 → AnySearch（无 CORS 仅尝试）
- 效果：**双击 index.html 即可搜索出真实结果**，无需任何后端/安装，符合"给普通用户（含手机）使用"的产品定位；后端仅为可选增强

### 修复（后端搜索引擎完全失效的致命 bug —— 2026-08-12 实测定位）
- **`wigoloSearch is not defined` 致命错误**：server.js 搜索链路第一行调用 `wigoloSearch`，但该函数只在前端 index.html 定义、后端未移植 → 每次搜索在第一步就抛异常被 catch 吞掉 → **所有搜索引擎永远不生效，只剩 Agnes AI 兜底编数据**。已补全 `wigoloSearch` 函数（调 localhost:3333，未运行时自动失败降级）
- **移除必挂的 Bing HTTP 直抓**（smzdm 202 反爬 / zhe800 404 / bing 302，实测必失败且白等 25s），由 Scrapling 浏览器级抓 Bing 替代
- 修复后实测：引擎 `anysearch-search` 生效，返回真实优惠（成都日报消费券/本地宝等）；耗时 101s→34s

### 新增（引擎增强）
- **Scrapling 浏览器级反爬抓取**（StealthyFetcher）：Bing 搜索页直抓可用（302→cn.bing.com→200），依赖 venv `juyou-scrapling` + `scrapling_fetch.py`
- **Firecrawl CLI 免 key 免费层**（官方 keyless，限速）：搜索/抓取兜底

### 安全加固（代码审查建议）
- runCli 超时改 `SIGKILL`（防僵尸进程）
- `/api/search` 请求体限制 1MB（防 DoS）
- primary 查询并发限制 3（防封 IP/额度瞬间耗尽）
- runQuery 引擎失败保留错误日志（不再静默）

### 搜索架构（v1.0.7）
Wigolo（本地引擎，未跑自动跳过）→ Firecrawl 免 key（纯前端主选，结构化直出）→ Bing 直抓 → AnySearch（无 CORS 仅尝试）；带 key 付费层备用（额度每月恢复）
后端：Wigolo → Scrapling 抓 Bing → AnySearch → Firecrawl REST → Firecrawl CLI → AI 兜底

### 纯前端限流（2026-08-13 补充）
- **修复 14 源全并发打 Firecrawl 免 key 层的隐患**：keyless 限速，全并发必被 429 打崩 → 纯前端只跑前 6 个关键源 + 每次 2 并发（mapLimit），后端已有并发 3 限制
- 验证：模拟用户流程「上海+浦东新区+奶茶」→ Firecrawl keyless 返回 5 条真实结果（乐购浦东消费券/浦东餐饮消费券等）

### 品类动态排序（2026-08-13 用户要求：主要场景=外卖电商，搜索标随品类调整）
- **源按品类打标签（cats）+ 动态排序**：用户选什么品类，命中品类的源排最前（纯前端限流只跑前 6 时确保都是相关源）
  - 奶茶/火锅/餐饮/外卖 → **美团外卖/饿了么/大众点评/抖音团购** 优先
  - 加油/充电 → **加油站/滴滴出行** 优先；银行/信用卡 → **银行信用卡/云闪付** 优先
  - 购物/电商 → **京东外卖/淘宝闪送/拼多多/天猫** 优先
- **新增/强化外卖电商源**：美团→"美团外卖"、京东→"京东外卖"、淘宝→"淘宝闪送"（q 模板带 {area}+平台词），原 14 源全保留
- 验证：7 个品类排序模拟全通过；前端语法 0 错误

### 渐进式加载 + 10 秒保底（2026-08-13 用户要求：不能让用户干等）
- **美团强制第一查询**：用户点搜索后第一个跑美团（10 秒内必出美团信息）
- **流式增量渲染**：按 2 源/批加载，每批出结果立即渲染（加载一个出一个），不再等全部跑完才显示
- **10 秒保底**：10 秒内无结果时显示明确提示"搜索源较慢（免费源限速），正在继续获取…"，绝不让用户面对空白
- 本地结果不足 3 条自动补全国可享（同样渐进渲染）；纯前端移除无效的 agnes 兜底（无 CORS 会被浏览器拦，避免白等）

### Agnes 兜底修复（2026-08-13 用户指出：agnes 永久免费一直在用，怎么会失效）
- **修正误判**：此前判断"agnes 无 CORS 被浏览器拦"是错的——那是用**无 key 401 错误响应**看头得出的（401 响应头不全）。实测：带 key POST 200 + **OPTIONS 预检 204 + `Access-Control-Allow-Origin: *`** → agnes 浏览器直连完全可用
- **恢复并强化 agnes 最终兜底**：全部搜索引擎失效时，**10 秒后立即**用 agnes 生成虚拟优惠并渲染，明确提示"⚠️ 实时搜索源暂不可用，以下为 AI 生成的参考优惠（非实时数据，请以平台实际为准）"
- **真实结果自动替换**：AI 兜底标记 `_aiFallback`，真实搜索结果到达后自动丢弃 AI 条目、替换渲染并清除提示（兜底只是过渡，尽量不走到）
- 实测：agnes 端到端返回真实 JSON 优惠（蜜雪冰城买一送一/喜茶9.9元等）

### Scrapling 防卡死（2026-08-13 电脑卡死 + 测试不成功排查）
- **根因**：后端每次搜索每源都触发 Scrapling 浏览器进程，runCli SIGKILL 只杀主进程，python→浏览器 子进程残留堆积，多次搜索累积 8+ 个浏览器，8GB 内存爆满 → 截屏时崩溃
- **三处修复**：① runCli 超时改 Windows `taskkill /F /T /PID` 进程树强杀（彻底杀 Scrapling 浏览器）② search 分支移除每源 scrapling-bing（避免并发触发）③ doSearch 末尾新增**全局兜底 1 次** Scrapling 抓 Bing（仅所有源都失败才跑，最多 1 次）
- **测试确认成功**：agent-browser 实测「成都 餐饮美食」→ 后端 AnySearch 出 **31 张真实卡片**（蜀宴赋/二荆条火锅/饿了么红包等）；骨架屏只是卡片在滚动下方未显示，并非"测试不成功"

## v1.0.6 - 2026-08-06

### 修复（搜索结果为空的关键 bug）
- **修复 kws 过滤清空结果的 bug**：当用户未提供关键词时 `kws` 为空数组，`kws.some()` 永远返回 false，导致所有搜索结果被过滤清空。修复后回退使用 `category`（品类）作为兜底关键词
- 修复后中文搜索正常返回结果：AnySearch + Agnes 知识库组合可生成 6-12 条优惠券卡片
- 地域标注正常工作：本地结果标记"本市"，全国结果标记"全国可享"，优先展示本地

### 搜索引擎集成
- 集成 Wigolo 作为主选搜索引擎（本地部署，端口 3333）
- 自动 fallback 机制：Wigolo 超时/失败时切换 Bing 直抓 → AnySearch → Firecrawl
- 前端添加 `wigoloSearch()` 函数支持本地搜索
- 引擎映射更新：展示层新增 "Wigolo搜索" 标识

---

## v1.0.5 - 2026-08-06

### 新增（Wigolo 本地搜索引擎集成）
- **新增 Wigolo 作为主选搜索引擎**：本地部署的 Wigolo MCP server（端口 3333）作为第一搜索引擎，无需 API key、无成本
- **自动 fallback 机制**：Wigolo 超时（1.5秒）或失败时自动切换到 Bing 直抓 → AnySearch → Firecrawl
- **前端支持**：index.html 添加 wigoloSearch() 函数，前端模式优先尝试本地 Wigolo
- **引擎映射更新**：展示层新增 "Wigolo搜索" 标识，便于用户了解数据来源

### 搜索引擎优先级（v1.0.5）
服务端：Wigolo → Bing直抓 → AnySearch → Firecrawl → BrowserAct → OpenCLI → Agnes
前端：Wigolo → Bing直抓 → AnySearch → Firecrawl → Agnes知识库

---

## v1.0.3 - 2026-08-04

### 新增（搜索第一备用：AnySearch）
- **新增 AnySearch 作为第一备用搜索引擎/抽取**：在免费主层（Bing直抓/directFetch）之后、Firecrawl（付费）之前插入 AnySearch
  - 关键词搜索：Bing直抓 → **AnySearch search（云端免费，匿名可用）** → Firecrawl search
  - URL 抓取：directFetch → **AnySearch extract（URL 全文抽取转 Markdown）** → Firecrawl scrape → BrowserAct
- AnySearch 通过 `https://api.anysearch.com/mcp`（JSON-RPC 2.0）调用，无需 API Key 即可匿名使用（限速），也可在 `ANYSEARCH_KEY` 配置免费 Key 提额
- 优势：云端免费、无需安装本地 CLI（对比 BrowserAct/OpenCLI），与 Firecrawl 同为云端 API 可直接服务端调用

### 搜索架构（v1.0.3）
主：Bing直抓/directFetch（免费）→ 第一备用：AnySearch（免费云端）→ 付费增强：Firecrawl → 本地CLI：BrowserAct → 登录态：OpenCLI → LLM兜底：Agnes

---

## v1.0.2 - 2026-08-03

### 修复（核心：搜索效果大幅提升）
- **搜索源全部默认开启**：美团团购、饿了么、抖音团购、大众点评、京东、淘宝、拼多多、天猫、滴滴出行、加油站、什么值得买、云闪付、银行信用卡、本地优惠——共14个源默认开启
- **Firecrawl搜索limit从10→50**：单次搜索返回更多结果
- **Bing直抓升级为多站聚合抓取**：依次抓取什么值得买、折800、返利网、Bing搜索，取第一个有效的结果，大幅提升优惠信息命中率
- **server.js与index.html同步**：修复bingDirectFetch返回类型适配问题

### 已知问题
- Firecrawl API 免费额度限制（1,000 credits/月），Search消耗2 credits/10条结果

---

## v1.0.1 - 2026-08-03

### 新增
- 添加 `API_KEYS_GUIDE.md` - API Keys 配置说明文档
- 文档说明 Firecrawl API 免费额度耗尽问题
- 提供获取新 API Key 的完整步骤
- 说明两种替换方式：源码修改 vs 用户配置界面

### 已知问题
- Firecrawl 内置免费 Key 已耗尽，需用户自行申请新 Key
- Agnes AI API 正常工作（免费额度充足）