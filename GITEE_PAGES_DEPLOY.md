# Gitee Pages 部署说明

本目录是 2026 世界杯观赛指南 PWA 网页版，可直接作为静态网站部署。

## 推荐部署方式

1. 在 Gitee 新建一个仓库，例如 `worldcup-guide-pwa`。
2. 复制仓库的 HTTPS 地址，例如：
   `https://gitee.com/你的用户名/worldcup-guide-pwa.git`
3. 在项目根目录运行：

```powershell
.\scripts\deploy_pwa_to_gitee.ps1 -RepoUrl "https://gitee.com/你的用户名/worldcup-guide-pwa.git"
```

4. 打开 Gitee 仓库页面，进入 `服务` -> `Gitee Pages`。
5. 选择分支 `master`，目录选择根目录 `/`，点击启动或更新。

## 本地验证

```powershell
python -m http.server 5179 --directory web
```

浏览器打开：

```text
http://localhost:5179/
```

iPhone 和电脑在同一个 Wi-Fi 时可打开：

```text
http://电脑局域网IP:5179/
```
