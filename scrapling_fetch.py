# -*- coding: utf-8 -*-
"""聚优惠 · Scrapling 反爬抓取脚本
用法: python scrapling_fetch.py <url>
输出: 提取后的网页文本(HTML→text),供 server.js 作为抓取源
说明: 用 StealthyFetcher(浏览器级反反爬)抓取,可过 Cloudflare 级反爬;
      实测 smzdm(什么值得买)/Bing 搜索页可用,折800 404,返利网超时。
      依赖: venv juyou-scrapling(scrapling[fetchers] + scrapling install 下载的浏览器)
"""
import re
import sys
from scrapling.fetchers import StealthyFetcher


def html_to_text(html):
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    if not url:
        print("ERROR: 缺少 URL 参数")
        return 1
    for attempt in range(2):
        try:
            # network_idle=False:避免等 load 事件超时(实测 smzdm 需此参数)
            page = StealthyFetcher.fetch(url, headless=True, network_idle=False, timeout=30000)
            # 页面仍在导航时取内容会报错,等它稳定
            import time
            time.sleep(3)
            html = page.html_content
            txt = html_to_text(html)
            if len(txt) > 300:
                print(txt)
                return 0
            return 1
        except Exception as e:
            if attempt == 0:
                import time as _t
                _t.sleep(2)
                continue
            print("ERROR:", type(e).__name__, str(e)[:200])
            return 1
    return 1


if __name__ == "__main__":
    sys.exit(main())
