# 聚优惠 (JuYouHui) v1.0.7

> 输入「城市 + 想干啥」，一键聚合全网优惠/折扣/券，输出带可点击链接的卡片。免费、开源、无广告。
> **架构对标校招雷达**：纯前端单文件（双击即用）+ 搜索引擎策略（Firecrawl 免 key 主选 + Wigolo + AnySearch 备用 + agnes 兜底）。

## ✨ v1.0.7 更新（2026-08-13）

- **纯前端真正可用**：Firecrawl 免 key 免费层浏览器直连（无 Key + CORS 放行），双击 index.html 即搜出真实优惠，手机/电脑零配置；带 Key 付费层备用（额度每月自动恢复）
- **搜索链路修复**：修复后端 `wigoloSearch is not defined` 致命 bug（此前所有引擎失效只剩 AI 兜底）；移除必挂的 Bing HTTP 直抓
- **品类动态排序**：选什么品类，相关源自动优先——外卖电商（美团外卖/饿了么/京东外卖/淘宝闪送）、加油（加油站/滴滴）、银行（银行/云闪付）
- **渐进式加载 + 10 秒保底**：美团优先，2 源/批流式渲染（加载一个出一个）；10 秒无真实结果立即 agnes 兜底并明确提示"AI 参考优惠"，真实结果到达自动替换
- **UI 简化**：删除输入框，品类按钮即点即搜；"生活出行"更名"出行加油"
- **防卡死**：Scrapling 降为全局兜底最多 1 次 + 进程树强杀，杜绝浏览器进程堆积占满内存
- 验证：19 地区全覆盖实测出真实结果；「成都/雅安 餐饮」实测 AnySearch 出真实优惠卡片（本市/全国可享 + 可信度标注）

聚优惠帮你解决一个日常痛点：**优惠信息太分散**——美团、淘宝、抖音、饿了么、银行信用卡、品牌会员各玩各的。
你只管说「成都不火锅有啥优惠」，剩下的聚合、抽取、核验交给它。

## 📺 宣传视频

> [观看 5 秒宣传视频](promo.mp4)（中文字幕 · 中文配音 · 1.5MB）

## 功能

- 🌆 **全国覆盖 · 三级联动**：省 → 市 → 区/县 三级联动选择（美团/抖音式底部弹层 + 热门城市快捷 + 定位 + 全国选项），不再局限于固定几个市
- 🍜 **9 大类消费场景**：餐饮 / 饮品 / 电影演出 / KTV / 生活出行 / 购物 / 生活服务 / 教育健康 / 数字权益
- 🔎 **实时搜索（主选 Wigolo + 备用链）**：前端浏览器**直连** Wigolo 本地搜索引擎；若本地服务不可用，自动 fallback 到 Bing 直抓、AnySearch、Firecrawl。**本地部署无 API 成本**
- 🤖 **AI 抽取 + 核验**：agnes-2.5-flash 把杂乱优惠文本归一化为标准卡片，并做**死链探测 / 新鲜度 / 可信度评分 / 去重**
- 🛡 **四层爬虫工具策略**：主选 Wigolo（本地搜索引擎，零成本）+ Bing直抓（免费）+ AnySearch（云端免费）+ BrowserAct（破反爬）+ OpenCLI（登录态），所有引擎失败后由 Agnes AI 生成兜底数据
- ✅ **正确真实优先**：低可信度卡片直接不下发，每张卡标注来源与核验状态，宁缺毋滥
- 📱 单文件前端，GitHub Pages / 任意静态托管即可，**手机电脑双击都能开**

## 技术架构（对标校招雷达 · 纯前端）

```
┌─────────────────────────────────────────────────────────┐
│  浏览器（任意设备，双击 index.html 即用）                  │
│  ├─ 主选：Wigolo 本地搜索引擎（http://localhost:3333）    │
│  ├─ 备用①：Bing/Google 直抓优惠聚合站                     │
│  ├─ 备用②：AnySearch 云端搜索（免费，匿名可用）            │
│  ├─ 备用③：Firecrawl 付费搜索（需 API Key）               │
│  ├─ 抽取：agnes-2.5-flash AI 归一化卡片                   │
│  ├─ 核验：死链探测 + 可信度评分 + 去重（前端 JS）          │
│  ├─ 距离：百度地图 JS API 地理编码 + 迷你地图             │
│  └─ 备用：📤 导入 BrowserAct / OpenCLI 导出的优惠 JSON    │
└─────────────────────────────────────────────────────────┘
        │
        ▼  （仅备用通道，纯本地，不在网页内运行）
   本机终端 CLI：browser-act / opencli juyouhui search → 导出 JSON → 导入
```

> 💡 **三把 Key 全部内置免费默认**（agnes / 百度 JS AK 已写死在 `index.html` 顶部常量），
> 双击 HTML 即出真实优惠，**零配置**。想用自己的配额可改 `index.html` 顶部对应常量。

## 快速开始

### 方式一：主选 Wigolo（推荐，需本地部署）

1. 启动本地 Wigolo 服务：`npx wigolo serve &`
2. 双击 `index.html`（或部署到 GitHub Pages）
3. 点「📍选地区」→ 选**省→市→区**（支持全国、定位、热门城市）
4. 输入场景（如「奶茶」「加油」）→ 点「搜优惠」
5. 前端直连 Wigolo 本地搜索引擎 → agnes 抽取 → 核验 → 渲染卡片

### 方式一·B：本地服务端代理（可选）

若浏览器因 CORS / `file://` 无法直连，或想启用完整 fallback 链，启动内置 `server.js`：

```bash
cd ju-you-hui && npm start   # 默认 http://localhost:3000，前端改连本地服务端即可
```

服务端 fallback 链：**Wigolo（本地）→ Bing直抓 → AnySearch → Firecrawl → BrowserAct → OpenCLI → Agnes 兜底**。

### 方式二：备用工具（BrowserAct / OpenCLI）

纯前端网页**无法直接调用**本地 CLI，故走「CLI 抓取 → 导出 JSON → 📤 导入」衔接：

**备用② BrowserAct**（破反爬/解验证码）
```bash
npm install -g browser-act
browser-act login
browser-act stealth-extract "https://www.meituan.com/deal/..." --out ba_heka.json
# 回到聚优惠点「📤 导入」选 ba_heka.json
```

**备用③ OpenCLI**（复用登录态全量库，见 `clis/juyouhui/`）
```bash
cd clis/juyouhui && npm i && npx playwright install chromium
node search.js "成都 奶茶" -f json > juyouhui.json
# 回到聚优惠点「📤 导入」选 juyouhui.json
# 也可注册为 opencli 子命令：opencli juyouhui search "成都 奶茶" -f json
```
点页面右上「🛡 备用工具」按钮可随时查看四层策略、安装命令与一键复制。

## 文件结构

```
ju-you-hui/
├── index.html              # 主程序（纯前端单文件，双击即用）
├── README.md               # 说明文档
├── LICENSE                 # MIT
├── config/sources.json     # 优惠源配置
└── clis/juyouhui/          # OpenCLI 备用适配器（本地 CLI 爬优惠）
    ├── search.js           # `opencli juyouhui search` 入口
    ├── utils.js            # Playwright 页面交互 + 字段映射
    └── package.json
```

## 开源与数据安全

- ✅ 免费开源（MIT）
- ✅ 仅聚合公开优惠信息，不收集用户隐私；定位数据仅在前端用于算距离，不上传
- ⚠️ 内置的 Firecrawl / agnes / 百度 AK 为免费默认额度，**克隆部署会共享同一免费额度**；若不愿共享，改为自己的 Key 即可（改 `index.html` 顶部常量）

## License

MIT © jiabaobei — 克隆代码请点个 Star ⭐
