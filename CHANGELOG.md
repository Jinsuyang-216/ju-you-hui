# 更新日志

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