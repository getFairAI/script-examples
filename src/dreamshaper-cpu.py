"""
# Copyright (c) 2023 Fair Protocol
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from diffusers import StableDiffusionPipeline
import os
import json
import datetime
import torch

torch.backends.cuda.matmul.allow_tf32 = True

print("Loading Model\n")
pipe = StableDiffusionPipeline.from_ckpt(
  "./dreamshaper_631BakedVae-full.safetensors",
  local_files_only=True,
  torch_dtype=torch.float16,
  use_safetensors=True
)

pipe.to("cpu")
pipe.safety_checker = None
pipe.requires_safety_checker = False
print("Model Loaded for CPU")

curr_dir = os.getcwd()
def get_inputs(prompt = "", batch_size=1):      
  current_time = int(datetime.datetime.now().timestamp() * 1000)                                                                                                                                                                                                           
  generator = [torch.Generator("cuda").manual_seed(current_time + i) for i in range(batch_size)]                                                                                   
  prompts = batch_size * [prompt]                                                                                                                                                                                                             
  num_inference_steps = 50                                                                                                                                                                                                  

  return {"prompt": prompts, "generator": generator, "num_inference_steps": num_inference_steps}
  
def gen_img(prompt: str) -> { "imgPaths": [str] }:
  """Generates images from a prompt"""
  images = pipe(**get_inputs(prompt,batch_size=4)).images
  paths = []
  for i, img in enumerate(images):
    file_path = f"{curr_dir}/result-{i}.png"
    img.save(file_path, 'png')
    paths.append(file_path)

  return { "imgPaths": paths }

hostName = "localhost"
serverPort = 8088


class MyServer(BaseHTTPRequestHandler):
  """Server Class"""
  def do_POST(self) -> None:
    if self.path == '/':
      # Gets the size of data
      content_length = int(self.headers['Content-Length'])
      # Gets the data itself
      post_data = self.rfile.read(content_length)
      prompt = post_data.decode("utf-8")
      result = gen_img(prompt)
      self.send_response(200)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps(result).encode('utf-8'))
    else:
      self.send_error(404)

class ThreadingSimpleServer(ThreadingMixIn, HTTPServer):
    """Thread Server Class"""
    pass

if __name__ == "__main__":
    webServer = ThreadingSimpleServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")