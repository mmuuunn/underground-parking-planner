'use strict';
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const code=`import importlib.util, threading, urllib.request, urllib.error, json
spec=importlib.util.spec_from_file_location('launcher','tools/launch-tools.py'); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
server=m.ThreadingHTTPServer(('127.0.0.1',0),m.ToolHandler); threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_address[1]); results=[]
try:
 for name,url,description in m.TOOLS:
  if url=='/underground': continue
  with urllib.request.urlopen(base+url,timeout=5) as response:
   results.append({'tool':name,'status':response.status,'html':len(response.read())>100})
 with urllib.request.urlopen(base+'/',timeout=5) as response:
  menu=response.read().decode('utf8'); assert all(name in menu for name,_,_ in m.TOOLS)
 with urllib.request.urlopen(base+'/index.html',timeout=5) as response:
  assert response.read().decode('utf8')==menu
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,*args): return None
 try: urllib.request.build_opener(NoRedirect).open(base+'/underground')
 except urllib.error.HTTPError as e: assert e.code==302 and e.headers['Location']==m.PLAN_URL
 try: urllib.request.urlopen(base+'/%2e%2e/AGENTS.md')
 except urllib.error.HTTPError as e: assert e.code==403
 else: raise AssertionError('path traversal accepted')
 # If only the chooser is running, still start and retain the missing plan server.
 servers=[]
 class FakeServer:
  def __init__(self,address,handler): self.address=address;self.started=False;self.closed=False;servers.append(self)
  def serve_forever(self): self.started=True
  def shutdown(self): pass
  def server_close(self): self.closed=True
 class FakeThread:
  def __init__(self,target,daemon): self.target=target
  def start(self): self.target()
 class FakeEvent:
  def wait(self): assert servers[0].started
 matches=iter([False,True]);m.matches=lambda *args: next(matches)
 m.ThreadingHTTPServer=FakeServer;m.threading.Thread=FakeThread;m.threading.Event=FakeEvent;m.webbrowser.open=lambda url: None
 import contextlib,io
 with contextlib.redirect_stdout(io.StringIO()): m.main()
 assert len(servers)==1 and servers[0].address[1]==8874 and servers[0].started and servers[0].closed
 print(json.dumps({'passed':True,'tools':results,'menu':True,'activeUnderground':m.PLAN_URL,'legacyUnmodified':True,'partialServerRecovery':True},ensure_ascii=True))
finally: server.shutdown();server.server_close()
`;
const result=JSON.parse(execFileSync('python',['-B','-c',code],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));assert(result.passed&&result.tools.length===6&&result.tools.every(t=>t.status===200&&t.html));console.log(JSON.stringify(result));
