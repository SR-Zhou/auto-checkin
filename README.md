# 自动签到服务（Node.js + Playwright）

本项目是一次性执行模型：
- 启动后先做页面预检查（是否已完成签到）
- 若页面显示今日已完成签到，直接发飞书通知并退出
- 若未完成，执行登录 -> 个人打卡 -> 小组长打卡
- 执行结束后退出

程序本身不再负责定时。建议使用 `systemd timer` 或其他外部调度器控制运行时间。

## 1. 安装

```bash
npm install
npx playwright install chromium
```

## 2. 配置

1. 环境变量：

```bash
cp .env.example .env
```

2. 站点选择器配置：

直接按页面实际情况修改 `config/site-config.json`。

`config/site-config.json` 中的 `url` 建议填写相对路径（例如 `/login`），程序会使用 `.env` 中的 `TARGET_URL` 自动拼接完整地址。

`personal/leader` 支持两种提交方式（二选一）：
- `submitSelector`：单按钮提交
- `submitSequence`：多按钮顺序点击

## 3. 运行

手工执行一次：

```bash
npm run start
```

## 4. 关键环境变量

必填：
- `TARGET_URL`
- `CHECKIN_USERNAME`
- `CHECKIN_PASSWORD`
- `FEISHU_WEBHOOK_URL`

可选默认值：
- `TIMEZONE=Asia/Shanghai`
- `MAX_ATTEMPTS=3`
- `BACKOFF_MIN_MS=30000`
- `BACKOFF_MAX_MS=90000`
- `HEADLESS=true`
- `BROWSER_TIMEOUT_MS=20000`
- `CHECKIN_ACTION_BUFFER_MS=1500`（每个提交动作前后的缓冲等待）

## 5. 运行产物

- `runtime/app.log`
- `runtime/screenshots/`

## 6. systemd 定时（推荐）

- 一次性执行服务：`deployment/daily-checkin.service`
- 每日定时触发：`deployment/daily-checkin.timer`

部署示例：

```bash
sudo cp deployment/daily-checkin.service /etc/systemd/system/
sudo cp deployment/daily-checkin.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now daily-checkin.timer
sudo systemctl status daily-checkin.timer
```
