# 商店文案（V1）

## 标题

B站字幕提取助手

## 简短描述

提取 B站视频已有字幕，清洗后可搜索，并导出 TXT / SRT / Markdown。

## 详细描述

这是一个字幕整理工具，不是视频下载器。

打开 B站视频页后，扩展会识别当前视频，并告诉你有几条可用字幕轨道。你选一条轨道，即可把字幕提取到本地工作台：

- 全文预览和关键词搜索
- 复制纯文本或带时间轴文本
- 导出 TXT、SRT、Markdown，方便放进笔记软件

本扩展只处理视频已经提供的字幕。没有字幕时会明确提示，不会做语音识别，也不会要求你购买第三方服务。

数据在本地处理。不上传字幕，不建立账号，不下载视频。

## 商店后台填写

| 项 | 内容 |
| --- | --- |
| 名称 | B站字幕提取助手 |
| 版本 | 1.0.0 |
| 隐私政策 | https://snowflake-hangdudu.github.io/bilibili-subtitle/ |
| 常见问题 | https://snowflake-hangdudu.github.io/bilibili-subtitle/faq.html |
| 支持邮箱 | hangdudu0@agent.qq.com |
| 分类 | 效率 / 生产力 |
| 语言 | 简体中文 |

## 权限说明（审核用）

- `storage`：保存导出格式、文件名模板等本机设置
- `downloads`：把 TXT / SRT / Markdown 存到用户指定位置
- `clipboardWrite`：工作台一键复制字幕文本
- `bilibili.com` / `api.bilibili.com` / `*.hdslb.com`：识别当前视频并读取已公开字幕
- 配置站：只读公告、开发合作和评分开关，不含字幕正文

## 建议截图

1. 视频页工具栏弹窗：识别到轨道，标题和 BV 与页面一致
2. 提取后的字幕工作台：列表、搜索、导出 TXT（默认）
3. 工作台复制 / 导出操作
4. 设置页：导出偏好（不要再拍已删除的权限说明卡）

不要用字幕和视频对不上的画面。画面有字但没有字幕轨道的片子，不要当成演示片。

## 打包

```bash
python scripts/pack.py
```

生成 `bilibili-subtitle-helper.zip`，调试区会关闭。把这个 ZIP 上传到商店，不要上传整个源码目录。

Edge 商店不接受 `content_scripts.type = module`，内容脚本由 `content-boot.js` 加载，不要改回去。
