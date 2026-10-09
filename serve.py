import os, http.server, socketserver, functools

port = int(os.environ.get('PORT', 5500))
here = os.path.dirname(os.path.abspath(__file__))

class VTPHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript'}
    def log_message(self, format, *args): pass

Handler = functools.partial(VTPHandler, directory=here)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', port), Handler) as s:
    s.serve_forever()
