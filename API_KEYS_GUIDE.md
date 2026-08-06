# API Keys 配置说明

## 当前状态

### Firecrawl
- **状态**: ❌ 不可用
- **错误**: `Unauthorized: Invalid token`
- **原因**: 内置免费 key 额度已耗尽
- **解决**: 需要申请新的 Firecrawl API Key
  - 访问: https://www.firecrawl.dev/pricing
  - 注册账号并获取 API Key
  - 将 Key 替换到 `index.html` 第 346 行和 `server.js` 第 19 行

### Agnes AI
- **状态**: ✅ 可用（有免费额度）
- **API**: https://api.agnes-ai.com/v1/chat/completions
- **Key**: `sk-1XjIeWT76KIfwqquWd2lU7Xtbe6Ny0oSzfWsf5JaT4jCPE78`
- **Model**: `agnes-2.5-flash`

## 如何替换 API Keys

### 方式一：直接修改源码（推荐个人使用）

**1. 修改 index.html（第 346 行）**
```javascript
// 原来
const FIRECRAWL_KEY = "fc-3d22bb5df55f4a5f96ac29099fe87b0d";
// 修改为你的 Key
const FIRECRAWL_KEY = "你的新Firecrawl Key";
```

**2. 修改 server.js（第 19 行）**
```javascript
// 原来
const FIRECRAWL_KEY = "fc-3d22bb5df55f4a5f96ac29099fe87b0d";
// 修改为你的 Key
const FIRECRAWL_KEY = "你的新Firecrawl Key";
```

### 方式二：使用用户配置界面（推荐发布使用）

应用已内置用户配置界面，用户可以在页面右上角点击「开发者选项」输入自己的 Key。

Key 会保存到浏览器 localStorage，下次打开自动加载。

## 免费 Firecrawl API Key 获取步骤

1. 访问 https://www.firecrawl.dev/
2. 点击 "Sign Up" 注册账号
3. 进入 Dashboard → API Keys
4. 创建新的 API Key
5. 复制 Key 并替换到上述两个文件

> **注意**: Firecrawl 免费套餐每月有 500 次 API 调用限制，足够个人使用。
