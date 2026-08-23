# B站字幕提取助手

把 B站视频**已经提供的字幕**提取出来，清洗成可搜索、可导出的学习资料。

- 不下载视频/音频
- 不做语音识别，不为无字幕视频生成字幕
- 全部本地处理，不上传字幕正文

## 安装（开发版）

1. 打开 Edge：`edge://extensions/`，或 Chrome：`chrome://extensions/`
2. 打开「开发人员模式」
3. 选择「加载解压缩的扩展」，指向本目录 `bilibili-subtitle-helper`
4. 打开任意 B站视频页，点击工具栏图标

## 使用

1. 打开 B站视频页
2. 扩展会显示检测到的字幕轨道数量
3. 选择轨道并点击「提取字幕」
4. 在工作台中搜索、复制或导出 TXT / SRT / Markdown

## 权限

| 权限 | 用途 |
| --- | --- |
| storage | 保存导出格式、文件名模板等本地设置 |
| downloads | 将导出文件保存到浏览器下载目录 |
| B站 / hdslb 访问 | 识别视频页并读取该视频已公开的字幕接口 |
| 配置站 | 读取公告、开发合作和评分开关，不含字幕正文 |

## 本地测试

```bash
npm test
```

## 目录

```
src/background/          消息路由、下载、会话
src/content/             页面识别与字幕读取
src/popup/               当前页状态与提取入口
src/workspace/           字幕列表、搜索、导出
src/options/             导出偏好与清理本地数据
src/platform/bilibili/   B站适配层
src/features/            解析、清洗、搜索、导出
```
