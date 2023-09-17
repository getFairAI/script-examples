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

4. Extract the model file and put the `3d-animation-style.safetensors` file on the `models/Stable-diffusion` folder of the directory you downloaded the WebUI

5. Put the `MoistMix.vae.pt` file on the `models/VAE` folder of the directory you downloaded the WebUI

6. Put the `easynegative.safetensors`, `bad-hands-5.pt`, and `badhandv4.pt` files on the `embeddings` folder of the directory you downloaded the WebUI

7. Navigate to the root folder of the directory you downloaded the WebUI and create a new environment

```sh
python3 -m venv stable-diffusion-webui-venv
```

8. On the same directory, activate the environment created

```sh
source stable-diffusion-webui-venv/bin/activate
```

9. On the same directory, start the WebUI on API mode

```sh
bash webui.sh --api
```

10. Download the script files and extract them to some folder

11. Open the `config.json` file and replace the "...3d Animation Style..." with the transaction ID of the Model Script, inside the comas. You can find it on the Studio application, on the Operators flow, where you downloaded the needed files for this installation, with the button "copy to clipboard"

12. Place your Arweave wallet file in the same folder under the name `wallet.json`

**Note:** Wallet must have funds in Bundlr node 2

13. Install and run the generic model script

```bash
npm install
npm start
```

**Note:** Installation is only needed on the first time

*Optional:* If you want to test the inference first, after putting the model in the same folder as the other files, run the test script with this command instead

```bash
ts-node test-inference.ts
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

* Edit 'webui-user.sh'
* Uncomment 'venv' line and update with correct virtual environment path like below, replace the path according to your installation

```sh
venv='/home/user/Desktop/stable-diffusion-webui/stable-diffusion-venv'
```

* Run "sudo nano /lib/systemd/system/stable-diffusion-webui-server.service"

and put the following text into the newly created file (replace all the "user" from the text with your system username, and replace the working directory with the folder where you have installed the script)

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
sudo systemctl enable generic-loop.service
sudo systemctl enable stable-diffusion-webui-server.service
```

* Run this command

```sh
sudo systemctl start generic-loop.service
```

* Run this command

```sh
sudo systemctl start stable-diffusion-webui-server.service
```

**Note:** To run the script after instalation, you just need to follow steps `8` and `11`.

### This is all for today, congrats if you made it this far!
