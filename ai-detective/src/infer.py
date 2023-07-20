"""
Copyright (c) 2023 Fair Protocol

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from model import GPT2PPL
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

model = GPT2PPL()

hostName = "localhost"
serverPort = 8087


class MyServer(BaseHTTPRequestHandler):
  def do_POST(self):
    if self.path == '/':
      content_length = int(self.headers['Content-Length']) # <--- Gets the size of data
      post_data = self.rfile.read(content_length) # <--- Gets the data itself
      prompt = post_data.decode("utf-8")
      results, out = model(prompt)
      self.send_response(200)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      json_dict = {
        "details": results,
        "result": out,
      }
      self.wfile.write(json.dumps(json_dict).encode('utf-8'))
    else:
      self.send_error(404)

if __name__ == "__main__":
    webServer = HTTPServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
