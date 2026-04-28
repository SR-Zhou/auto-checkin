# 自动签到服务（Node.js + Playwright）

本项目是一次性执行模型：
- 启动后先做页面预检查（是否已完成签到）
- 若页面显示今日已完成签到，记录日志并退出
- 若未完成，执行 登录 -> 个人打卡 -> 小组长打卡
- 检测到"不在打卡时间段"时退出（不计为失败）
- 执行结束后退出

程序本身不负责定时。建议使用 `systemd timer` 或其他外部调度器控制运行时间。

## 1. 安装

```bash
npm install
npx playwright install chromium
```

## 2. 配置

### 2.1 环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际的账号信息
```

### 2.2 站点选择器

编辑 `config/site-config.json`。URL 建议写相对路径（如 `/login`），程序会使用 `.env` 中的 `TARGET_URL` 自动拼接完整地址。

#### `personal` / `leader` 配置字段

提交方式二选一：

- `submitSelector`：单按钮提交
- `submitSequence`：多按钮顺序点击，每项支持：
  - `selector`：元素选择器
  - `force`：`true` 使用真实鼠标模拟点击 + 随机偏移（绕过 Vue/Element UI 事件劫持）
  - `waitMs`：点击后的等待时间(ms)
  - `confirmSelector`：二次确认按钮（可选）
  - `waitForSelector`：等待某元素出现后再继续（可选）

结果检测：

- `successSelector`：成功提示元素
- `alreadyDoneSelector`：已完成标记（跳过本次打卡）
- `notInTimeWindowSelector`：不在打卡时间段提示（如 `"text=当前不在打卡时间段内"`）

## 3. 运行

```bash
npm start
```

## 4. 环境变量参考

### 必填

| 变量 | 说明 |
|------|------|
| `TARGET_URL` | 签到站点地址（如 `https://www.example.com`） |
| `CHECKIN_USERNAME` | 登录用户名/学号 |
| `CHECKIN_PASSWORD` | 登录密码 |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TIMEZONE` | `Asia/Shanghai` | 时区 |
| `HEADLESS` | `true` | 无头模式，`false` 可见浏览器窗口 |
| `MOBILE_EMULATION` | `true` | 模拟 Android Chrome（User-Agent + touch 事件），绕过鼠标检测 |
| `MAX_ATTEMPTS` | `1` | 最大重试次数 |
| `BACKOFF_MIN_MS` | `30000` | 重试最小退避时间(ms) |
| `BACKOFF_MAX_MS` | `90000` | 重试最大退避时间(ms) |
| `BROWSER_TIMEOUT_MS` | `20000` | 浏览器等待超时(ms) |
| `BROWSER_SLOW_MO_MS` | `0` | 浏览器操作减速(ms)，调试时加大可看清页面 |
| `CHECKIN_ACTION_BUFFER_MS` | `1500` | 每个提交动作前后的缓冲等待(ms) |
| `SITE_CONFIG_PATH` | `./config/site-config.json` | 选择器配置文件路径 |
| `SCREENSHOT_DIR` | `./runtime/screenshots` | 失败截图目录 |
| `LOG_PATH` | `./runtime/app.log` | 日志文件路径 |

## 5. 运行产物

- `runtime/app.log` — JSON 格式运行日志
- `runtime/screenshots/` — 失败时自动截图，提交后也会截一张 `*-before-outcome` 供排查

## 6. 重试机制

遇到以下错误会自动重试（最多 `MAX_ATTEMPTS` 次，间隔 `BACKOFF_MIN_MS` ~ `BACKOFF_MAX_MS` 随机退避）：

- 网络超时 / 连接重置
- 浏览器意外关闭
- 提交后未检测到成功状态

登录失败、选择器找不到元素等错误不会重试，直接退出。

## 7. systemd 定时（推荐）

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
