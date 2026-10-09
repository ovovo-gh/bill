# 资产清单

个人资产余额看板，纯静态网页，部署到 GitHub Pages。无需登录、服务器或 Cloudflare 账号。

## 功能

- 自定义账户名称、分类、颜色、备注，直接修改余额。
- 账户按折合人民币金额默认从高到低排列，也可切换为从低到高。
- 人民币、港币、日元和欧元，获取每日参考汇率折合人民币。
- 总资产、总负债和净资产；信用卡欠款按正数输入，自动从净资产扣除。
- 搜索、分类筛选、余额历史、账户归档与恢复；归档账户仍可直接编辑金额，并继续保留归档状态。
- 当前浏览器自动保存，JSON 文件备份与恢复。不同浏览器、设备、域名分别保存自己的账目。
- 手机与电脑适配，隐藏金额。

清除网站数据、使用无痕模式或更换浏览器可能导致账目不可用。请定期导出备份。备份为明文 JSON，包含账户和金额，请妥善保管。实际账目不会上传到 GitHub；网络请求仅用于获取公开汇率。

## 开发与验证

需要 Node.js 20+、Python 3，无需安装 npm 依赖。

```sh
npm run dev
npm test
npm run build
```

预览 http://127.0.0.1:4173 。构建产物为 dist/。

## GitHub Pages 部署

仓库： https://github.com/ovovo-gh/bill

1. 仓库 Settings → Pages → Build and deployment → Source，选择 GitHub Actions。
2. 推送 main 后，工作流自动测试、构建并发布。
3. 成功后网址为 https://ovovo-gh.github.io/bill/ 。

若本机 Git 推送返回 403，可创建只允许访问 bill 的 fine-grained personal access token，Repository permissions 中 Contents 与 Workflows 均选 Read and write。令牌不要发送到聊天或保存到项目文件。在 macOS 终端运行：

```sh
python3 '/Users/gonghan/Desktop/project/记账/scripts/configure-github.py'
```

按提示粘贴令牌，输入不会显示；它只写入 macOS Git 凭据钥匙串。脚本会启用仓库级凭据路径，避免更改其他仓库的登录方式。之后即可在此仓库推送。

## 数据说明

- 余额使用最小货币单位整数保存；人民币、港币、欧元到分，日元到整数。
- 币种创建后固定，避免把旧历史误当成新币种。需更换时新建账户并归档旧账户。
- 归档账户不参与合计，历史保留。
- 汇率来源 https://frankfurter.dev/ ，每日参考价，不是实际兑换成交价。获取失败使用缓存并显示日期；缺失外币汇率时暂停显示合计，避免漏算。
- 从旧预览升级时，自动读取原浏览器加密缓存并迁移，保留旧缓存以便恢复。旧版加密导出文件不支持直接导入新版；可先在仍保留旧本机数据的浏览器中升级，再导出新版备份。
- 本地保存失败不会覆盖内存里的上一次已保存账本。检测到其他标签页更新时要求刷新。
