# Instructions on how to install VITS Female Text Reader

**Note:** This script only works with Linux systems

## Dependencies
To use this library, you need to do:


1. Download model file and place the model_file.pth and config.json files in `/home/user/.local/share/tts/tts_models--en--ljspeech--vits` (replace the "user" from the path with your system username)

    * (Optional) You can try to just jump this step, and the program will try to download the file automatically

2. Download the script files and extract

3. Place your arweave wallet file in the root folder under the name `wallet.json`
**Note:** Wallet must have funds in Bundlr node 1

4. (Optional) Create a python virtual environment
```sh
python3 -m venv path/to/set/environment
source path/to/set/environment/bin/activate
```

5. Install Requirements
```
pip install -r requirements.txt
```

6. Open a terminal in the scripts folder (with the python virtual environment active if using venv)
```sh
python inference.py # or python inference-cpu.py
```
**Note:** Cpu inference is much slower than using gpu

7. Using another terminal in same folder run
```sh
npm install
npm start
```

*Optional:* If you want to test the inference first, after putting the model on the same folder as the other files run instead the test script with

```bash
ts-node vits-inference-test.ts
```

8. (Optional) Make the script always run on background when computer starts

* Run this command 

```sh
sudo nano /lib/systemd/system/vits-loop.service
```
    
and put the following text into the newly created file (replace all the "user" from the text with your system username)

```conf
[Unit]
Description=VITS Loop
[Service]
Type=simple
User=user
Environment=NODE_VERSION=18.16.1
ExecStart=/home/user/.nvm/nvm-exec npm start
WorkingDirectory=/home/user/Desktop/vits
[Install]
WantedBy=multi-user.target
```

* Run "sudo nano /lib/systemd/system/vits-server.service" 

and put the following text into the newly created file (replace all the "user" from the text with your system username)

```conf
[Unit]
Description=VITS Model Server
[Service]
WorkingDirectory=/home/user/Desktop/vits/
ExecStart=/home/user/Desktop/vits/vits-env/bin/python src/inference.py
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

* Run this command

```sh
sudo systemctl daemon-reload
```

* Run this command

```sh
sudo systemctl start vits-server
```

* Run this command

```sh
sudo systemctl start vits-loop
```

#### This is all for today, congrats if you made this far!
