"""Run locally; never paste a GitHub token into chat or commit it to this repository."""
from getpass import getpass
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
print('为 ovovo-gh/bill 配置发布权限。令牌仅写入 macOS 钥匙串，不会写入项目文件。')
token = getpass('粘贴 GitHub 令牌（输入时不会显示），然后回车：').strip()
if not token or any(c.isspace() for c in token):
    raise SystemExit('未保存：令牌为空或含空白字符。')
credential = 'protocol=https\nhost=github.com\npath=ovovo-gh/bill.git\nusername=ovovo-gh\npassword=' + token + '\n\n'
subprocess.run(['git', '-c', 'credential.helper=', '-c', 'credential.helper=osxkeychain', '-c', 'credential.useHttpPath=true', 'credential', 'approve'], input=credential, text=True, check=True, cwd=root)
subprocess.run(['git', 'config', '--local', 'credential.useHttpPath', 'true'], check=True, cwd=root)
subprocess.run(['git', 'config', '--local', 'credential.https://github.com.username', 'ovovo-gh'], check=True, cwd=root)
print('已保存。回到聊天告诉我“已配置”，我会继续上传并检查发布结果。')
