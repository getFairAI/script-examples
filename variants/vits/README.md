# Instructions on how to install VITS Female Text Reader

**Note:** This script only works with Linux systems

## Dependencies
To use this library, you need to do:


1. Download model file and place the model_file.pth and config.json files in `/home/user/.local/share/tts/tts_models--en--ljspeech--vits` (replace the "user" from the path with your system username)

    * (Optional) You can try to just jump this step, and the program will try to download the file automatically

2. Download the script files and extract them to some folder

3. Open the `config.json` file and replace the "...VITS..." with the transaction ID of the Model Script, inside the comas. You can find it on the Studio application, on the Operators flow, where you downloaded the needed files for this installation, with the button "copy to clipboard"

4. Place your Arweave wallet file in the same folder under the name `wallet.json`

**Note:** Wallet must have funds in Bundlr node 2

5. Install and run the generic model script

```bash
npm install
npm start
```

**Note:** Installation is only needed on the first time

*Optional:* If you want to test the inference first, after putting the model in the same folder as the other files, run the test script with this command instead

```bash
ts-node test-inference.ts
```

*Optional:* Create a python virtual environment
```sh
python3 -m venv path/to/set/environment
source path/to/set/environment/bin/activate
```

6. Install Requirements
```
pip install -r requirements.txt
```

7. Open a terminal in the scripts folder (with the python virtual environment active if using venv)
```sh
python vits.py
```

*Optional:* Make the script always run in the background when the computer starts

* Run this command

```sh
sudo nano /lib/systemd/system/generic-loop.service
```

**Note:** You should only run one loop for this script for each PC, even when using other models with the same configuration

* Put the following text into the newly created file (replace all the "user" from the text with your system username, and replace the working directory with the folder where you have installed the script)

```conf
[Unit]
Description=Fair Protocol Generic Loop
[Service]
Type=simple
User=user
Environment=NODE_VERSION=18.16.1
ExecStart=/home/user/.nvm/nvm-exec npm start
WorkingDirectory=/home/user/Desktop/generic-loop
Restart=on-failure
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
ExecStart=/home/user/Desktop/vits/vits-env/bin/python src/vits.py
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
sudo systemctl start generic-loop.service
```

* Run this command

```sh
sudo systemctl start vits-server.service
```

#### This is all for today, congrats if you made this far!
