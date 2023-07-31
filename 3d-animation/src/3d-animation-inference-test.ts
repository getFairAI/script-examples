/*
 * Copyright (c) 2023 Fair Protocol
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import CONFIG from '../config.json' assert { type: 'json' };
import fs from 'node:fs'

const payload = {
  enable_hr: "true",
  denoising_strength: 0.5,
  hr_scale: 2,
  hr_upscaler: "Latent",
  hr_second_pass_steps: 20,
  prompt: "masterpiece, best quality,hippy woman, bohemian, free spirit, flower child, hippie fashion, retro, vintage, 1960s, 1970s, peace symbol, tie-dye, headband, guitar, music festival, outdoor, nature lover, carefree, laid-back, unconventional, nonconformist, boho-chic, wanderlust, traveler, backpacker, hippie lifestyle, communal living, alternative, counterculture, spiritual, mindfulness, meditation, yoga, organic, vegetarian, environmentalism, activism, social justice, human rights, peace and love, colorful, bright, happy.",
  seed: -1,
  n_iter: 4,
  steps: 20,
  cfg_scale: 7,
  negative_prompt: "EasyNegative, drawn by bad-artist, sketch by bad-artist-anime, (bad_prompt:0.8), (artist name, signature, watermark:1.4), (ugly:1.2), (worst quality, poor details:1.4), bad-hands-5, badhandv4, blurry,",
  sampler_index: "Euler a",
}

const inference = async function () {
  const res = await fetch(`${CONFIG.url}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
  });
  const tempData: { images: string[] } = await res.json();
  tempData.images.forEach((el, i)=>fs.writeFileSync(`output_${i}.png`, Buffer.from(el, 'base64')));
};

(async () => {
  await inference();
})();