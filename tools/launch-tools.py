"""Local tool chooser; archived apps are served read-only from their original folder."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import threading
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('CONFIGURATOR_LEGACY_ROOT', ROOT.parent / '90_이전건축도구_legacy')).resolve()
PLAN_URL = 'http://127.0.0.1:8874/04_parking/underground-compare.html?start=site'
MENU_URL = 'http://localhost:8877/'
TOOLS = [
    ('계단', '/01_stair/', '계단 형상·평면·단면'),
    ('복도', '/02_corridor/', '복도 너비·보행거리'),
    ('코어', '/06_core_layout/', '계단·승강기·홀·샤프트'),
    ('프로그램', '/03_program/', '실별 면적과 배치'),
    ('지상주차', '/04_parking/', '주소·필지에서 시작하는 지상주차 계획'),
    ('지하주차', '/underground', '부지 선택·반자동 배치·도면 편집'),
    ('통합 캔버스', '/07_integrated_canvas/', '대지와 생성한 코어 배치'),
]
MENU = '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>건축 컨피규레이터 · 도구 선택</title><style>
*{box-sizing:border-box}body{margin:0;background:#f1f3ef;color:#283a31;font:16px system-ui,sans-serif}main{max-width:1000px;margin:70px auto;padding:24px}h1{font-size:32px;margin-bottom:12px}p{color:#69786e;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:32px 0}a.tool{display:block;padding:26px;background:white;border:1px solid #d1dacf;border-radius:10px;color:inherit;text-decoration:none}a.tool:hover{border-color:#44755d;box-shadow:0 3px 14px #354c3815}.tool b{display:block;font-size:21px;margin-bottom:10px}.tool span{font-size:13px;color:#69786e}footer{font-size:13px}footer a{color:#416e53}</style>
<main><h1>건축 컨피규레이터</h1><p>작업할 도구를 선택하세요.</p><div class="grid">''' + ''.join(
    f'<a class="tool" href="{url}"><b>{name}</b><span>{description}</span></a>' for name, url, description in TOOLS
) + '</div><footer><a href="http://127.0.0.1:8765/">지하주차 개발 현황</a> · 기존 도구의 원본 파일은 그대로 사용합니다.</footer></main></html>'


class ToolHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(LEGACY), **kwargs)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route in ('/', '/index.html'):
            content = MENU.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        elif route in ('/underground', '/04_parking/underground-compare.html'):
            self.send_response(302)
            self.send_header('Location', PLAN_URL)
            self.end_headers()
        elif '..' in Path(unquote(route)).parts:
            self.send_error(403)
        else:
            super().do_GET()


def matches(url, marker):
    try:
        with urlopen(url, timeout=2) as response:
            return marker in response.read().decode('utf-8', errors='replace')
    except OSError:
        return False


def main():
    if not (LEGACY / '01_stair/index.html').is_file():
        raise RuntimeError(f'기존 도구 폴더를 찾지 못했습니다: {LEGACY}')
    servers = []
    if not matches(PLAN_URL, 'id="plan"'):
        server = ThreadingHTTPServer(('127.0.0.1', 8874), partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
        servers.append(server)
    try:
        if not matches(MENU_URL, '건축 컨피규레이터 · 도구 선택'):
            chooser = ThreadingHTTPServer(('127.0.0.1', 8877), ToolHandler)
            servers.append(chooser)
        for server in servers:
            threading.Thread(target=server.serve_forever, daemon=True).start()
        print('Tool chooser: ' + MENU_URL, flush=True)
        print('Close this window or press Ctrl+C to stop servers started here.', flush=True)
        if not os.environ.get('CONFIGURATOR_NO_BROWSER'):
            webbrowser.open(MENU_URL)
        if servers:
            threading.Event().wait()
    finally:
        for server in servers:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        print('Could not start the chooser. An occupied port was not replaced: ' + str(error))
        raise SystemExit(1)
