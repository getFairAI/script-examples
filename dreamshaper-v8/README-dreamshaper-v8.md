# Instructions on how to install 3D Animation Style

## Notes

This script was tested with Ubuntu 22.04 LTS, with the model running on an NVIDIA GPU. It should work in other environments, but some tweaks may be necessary in the following steps.

The Stable Diffusion WebUI version used was 1.5.1.

## Dependencies

To use this library, you need to have the following:

1. Install needed dependencies

```sh
# Debian-based:
sudo apt install wget git python3 python3-venv
# Red Hat-based:
sudo dnf install wget git python3
# Arch-based:
sudo pacman -S wget git python3
```

2. Install the Stable Diffusion WebUI from AUTOMATIC111

```sh
git clone --depth 1 --branch v1.5.1 https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
```

3. Download the model file and read the license terms

4. Extract the model file and put the `dreamshaper_8.safetensors` file on the `models/Stable-diffusion` folder of the directory you downloaded the WebUI

5. Put the `BadDream.pt` and `FastNegativeV2.pt` files on the `embeddings` folder of the directory you downloaded the WebUI

6. Navigate to the root folder of the directory you downloaded the WebUI and create a new environment

```sh
python3 -m venv stable-diffusion-webui-venv
```

7. On the same directory, activate the environment created

```sh
source stable-diffusion-webui-venv/bin/activate
```

8. On the same directory, start the WebUI on API mode

```sh
bash webui.sh --api
```

9. Download the script files and extract them to some folder

10. Place your Arweave wallet file in the same folder under the name `wallet.json`

**Note:** Wallet must have funds in Bundlr node 2

11. Run the 3D Animation model script

```bash
ts-node 3d-animation.ts
```

*Optional:* If you want to test the inference first, after putting the model in the same folder as the other files, run the test script with one of those commands instead

```bash
ts-node 3d-animation-inference-test.ts
python3 3d-animation-inference-test.py
```

*Optional:* Make the script always run in the background when the computer starts

* Run this command

```sh
sudo nano /lib/systemd/system/3d-animation-style-loop.service
```

* put the following text into the newly created file (replace all the "user" from the text with your system username)

```conf
[Unit]
Description=Loop 3D Animation Style
[Service]
Type=simple
User=user
Environment=NODE_VERSION=18.16.1
ExecStart=/home/user/.nvm/nvm-exec npm start
WorkingDirectory=/home/user/Desktop/3d-animation-style
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

* Edit 'webui-user.sh'
* Uncomment 'venv' line and update with correct virtual environment path like below, replace the path according to your installation

```sh
venv='/home/user/Desktop/stable-diffusion-webui/stable-diffusion-venv'
```

* Run "sudo nano /lib/systemd/system/stable-diffusion-webui-server.service"

and put the following text into the newly created file (replace all the "user" and path from the text with your system username and path where the Stable Diffusion WebUI is)

```conf
[Unit]
Description=Stable Diffusion WebUI Server
[Service]
User=user
WorkingDirectory=/home/user/Desktop/stable-diffusion-webui/
ExecStart=/bin/bash webui.sh
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

* Run this command

```sh
sudo systemctl daemon-reload
```

* Set services to start on boot

```sh
sudo systemctl enable 3d-animation-style-loop.service
sudo systemctl enable stable-diffusion-webui-server.service
```

* Run this command

```sh
sudo systemctl start vits-server
```

* Run this command

```sh
sudo systemctl start vits-loop
```

**Note:** To run the script after instalation, you just need to follow steps `8` and `11`.

### This is all for today, congrats if you made it this far!
