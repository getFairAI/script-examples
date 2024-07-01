
Clone Repository for [Llama.cpp](https://github.com/ggerganov/llama.cpp)
**Note**: Check Install instructions in repository for pre-requisites
```sh
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
```

Install requirements:
```sh
python -m venv ./llama-cpp-venv # install virtual environment in the current location in folder ./llama-cpp-venv

source ./llama-cpp-venv/bin/activate # activate virtual environment

pip install -r requirements
```

Download model weights and extract  in `./models`

Convert model weights to llama.cpp format:

```sh
python3 convert.py ./models/<mixtral-folder>
```

Quantize Model:

```sh
./quantize ./model/<mixtral-folder/model.gguf> ./destination.gguf
```

Build Project:
```sh
make
```

Run server:

```sh
./server -m /path/to/model.gguf
```

**Note:** check [server example](https://github.com/ggerganov/llama.cpp/tree/master/examples/server) for server parameteres

```sh
sudo nano /lib/systemd/system/mixtral-server.service
```

**Note:** You should only run one loop for this script for each PC, even when using other models with the same configuration

* Put the following text into the newly created file (replace all the "user" from the text with your system username, and replace the working directory with the folder where you have installed the script)

```conf
[Unit]
Description=Mixtral llama.cpp server
[Service]
WorkingDirectory=/home/user/path/to/llama/repo
ExecStart=/bin/sh -c "./server -m ./models/mixtral-8x7b-instruct-v0.1-q8.gguf"
[Install]
WantedBy=multi-user.target
```

* Run this command

```sh
sudo systemctl daemon-reload
```

* Set services to start on boot

```sh
sudo systemctl enable mixtral-server.service
```

* Run this command

```sh
sudo systemctl start mixtral-server.service
```
