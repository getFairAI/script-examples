import json
import requests
import io
import base64
from PIL import Image, PngImagePlugin

url = "http://127.0.0.1:7860"

payload = {
    "enable_hr": "true",
    "denoising_strength": "0.5",
    "hr_scale": "2",
    "hr_upscaler": "Latent",
    "hr_second_pass_steps": "20",
    "prompt": "masterpiece, best quality,hippy woman, bohemian, free spirit, flower child, hippie fashion, retro, vintage, 1960s, 1970s, peace symbol, tie-dye, headband, guitar, music festival, outdoor, nature lover, carefree, laid-back, unconventional, nonconformist, boho-chic, wanderlust, traveler, backpacker, hippie lifestyle, communal living, alternative, counterculture, spiritual, mindfulness, meditation, yoga, organic, vegetarian, environmentalism, activism, social justice, human rights, peace and love, colorful, bright, happy.",
    "seed": "-1",
    "n_iter": "4",
    "steps": "20",
    "cfg_scale": "7",
    "negative_prompt": "EasyNegative, drawn by bad-artist, sketch by bad-artist-anime, (bad_prompt:0.8), (artist name, signature, watermark:1.4), (ugly:1.2), (worst quality, poor details:1.4), bad-hands-5, badhandv4, blurry,",
    "sampler_index": "Euler a",
}

override_settings = {}
#override_settings["filter_nsfw"] = "false"
override_settings["sd_model_checkpoint"] = "disneyPixarCartoon_v10.safetensors [732d0dd2cf]"
override_settings["sd_vae"] = "MoistMix.vae.pt"
override_settings["CLIP_stop_at_last_layers"] = 2

override_payload = {
                "override_settings": override_settings
            }
payload.update(override_payload)

response = requests.post(url=f'{url}/sdapi/v1/txt2img', json=payload)

r = response.json()

x = 0
for i in r['images']:
    image = Image.open(io.BytesIO(base64.b64decode(i.split(",",1)[0])))

    png_payload = {
        "image": "data:image/png;base64," + i
    }
    response2 = requests.post(url=f'{url}/sdapi/v1/png-info', json=png_payload)

    pnginfo = PngImagePlugin.PngInfo()
    pnginfo.add_text("parameters", response2.json().get("info"))
    image.save('output' + str(x) + '.png', pnginfo=pnginfo)
    x = x + 1