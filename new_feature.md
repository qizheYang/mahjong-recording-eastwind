需要增加功能 - search
1. 双响/三响 ✅
2. 犯规惩罚 ✅
3. 注册用户 ✅ (reworked: 公式战 ID + email OTP via Resend)
4. 切上选择 ✅
5. 规则预设 ✅ (公式战/M-League/最高位戦/WRC/Custom)
6. 役满选择 + 双倍役满 ✅
7. 自定义uma ✅
8. 编辑已记录的手牌 ✅

---

## Resend Email OTP - 验证计划

### 架构概述
用户注册时输入”公式战 ID”（用户名）和可选的 email。如果 `RESEND_API_KEY` 环境变量已配置且用户提供了 email，则通过 Resend 发送 6 位验证码到邮箱。否则跳过验证，直接注册。

### 关键文件
- **Server 邮件服务**: `packages/server/src/services/email-service.ts`
  - 使用 `resend` npm 包（v6.9.2）
  - 环境变量: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`（默认 `onboarding@resend.dev`）
  - `isOtpEnabled()`: 检查 RESEND_API_KEY 是否存在
  - `sendOtp(email)`: 生成6位码，存入内存 Map（5分钟TTL），通过 Resend 发送
  - `verifyOtp(email, code)`: 校验码是否匹配且未过期
  - 每60秒清理过期 OTP

- **Server 路由**: `packages/server/src/routes/users.ts`
  - `POST /api/users/register` — body: `{ username, email? }`
    - 返回 `{ id, username, email, needsVerification: boolean }`
    - `needsVerification=true` 时前端跳转到验证码输入界面
    - `needsVerification=false` 时直接注册成功
  - `POST /api/users/verify` — body: `{ email, code }`
  - `POST /api/users/resend-otp` — body: `{ email }`
  - `GET /api/users` — 列出所有已验证用户
  - `GET /api/users/search?q=` — 按用户名模糊搜索

- **数据库**: `packages/server/src/db/schema.ts`
  - `registered_users` 表: `id, username (UNIQUE), email, email_verified, created_at, updated_at`
  - Drizzle ORM 参数化查询，防 SQL 注入

- **前端注册页**: `packages/client/src/pages/RegisterPage.tsx`
  - 步骤: form (公式战 ID + email) → verify (6位码) → success
  - 如果 `needsVerification=false` 则跳过 verify 步骤

- **前端 API**: `packages/client/src/lib/api.ts`
  - `registerUser(username, email?)`, `verifyEmail(email, code)`, `resendOtp(email)`

### 验证步骤
1. 确认 `.env` 中有 `RESEND_API_KEY=re_N2AvqRQS_EeFL6nL7fBiYZNfTrYHRQpd1`
2. 启动 dev server: `npm run dev`
3. 打开注册页面 (`/register`)
4. 输入一个公式战 ID 和 email 地址（例如 `yangchar@usc.edu`）
5. 点击注册 → 应该收到验证邮件
6. 输入6位验证码 → 注册成功
7. 也测试不填 email 的情况 → 应该直接注册成功（跳过验证）
8. 注意: `onboarding@resend.dev` 发件人只能发送到 Resend 账户绑定的邮箱（免费限制）
   - 要发送到任意邮箱需要在 Resend 控制台验证自定义域名