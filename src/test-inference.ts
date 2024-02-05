import fs from 'node:fs';
import { IOptionalSettings, ServerResponse, UrlConfig } from './interfaces';
import { default as Pino } from 'pino';
import CONFIG from '../config.json' assert { type: 'json' };

const logger = Pino({
  name: 'Operator Loop',
  level: 'info',
});

interface TestOperatorParams {
  scriptId: string;
  url: string;
  payloadFormat: string;
  settings?: IOptionalSettings;
}

const parsePayload = (
  format: string,
  text: string,
  settings?: IOptionalSettings,
  negativePrompt?: string,
  nImages?: string,
) => {
  let payload;

  if (format === 'webui') {
    const webuiPayload: IOptionalSettings = {
      ...(settings && { ...settings }),
      prompt: settings?.prompt ? `${settings?.prompt}${text}` : text,
    };

    if (negativePrompt && webuiPayload['negative_prompt']) {
      webuiPayload['negative_prompt'] = `${webuiPayload['negative_prompt']} ${negativePrompt}`;
    } else if (negativePrompt) {
      webuiPayload['negative_prompt'] = negativePrompt;
    } else {
      // ignore
    }

    const maxImages = 10;

    if (nImages && parseInt(nImages, maxImages) > 0 && parseInt(nImages, maxImages) <= maxImages) {
      webuiPayload['n_iter'] = nImages;
    } else {
      // ignore
    }

    payload = JSON.stringify(webuiPayload);
  } else {
    payload = text;
  }

  return payload;
};

const fetchSeed = async (url: string, imageStr: string) => {
  try {
    const infoUrl = url.replace('/txt2img', '/png-info');

    const secRes = await fetch(infoUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: `data:image/png;base64,${imageStr}` }),
    });

    const result: { info: string; items: { parameters: string } } = await secRes.json();
    const seedStrStartIdx = result.info.indexOf('Seed:');
    const seedStrEndIdx = result.info.indexOf(',', seedStrStartIdx); // search for next comma after 'Seed:' substring

    const seedStr = result.info.substring(seedStrStartIdx, seedStrEndIdx);
    const seed = seedStr.split('Seed:')[1].trim();

    return seed;
  } catch (e) {
    return '';
  }
};

const inference = async function (
  text: string,
  registration: TestOperatorParams,
  negativePrompt?: string,
  nImages?: string,
) {
  const { scriptId, url, settings, payloadFormat: format } = registration;

  logger.info(`User Prompt: ${text}`);

  const payload = parsePayload(format, text, settings, negativePrompt, nImages);

  const res = await fetch(url, {
    method: 'POST',
    ...(format === 'webui' && {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
    }),
    body: payload,
  });
  const tempData: ServerResponse = await res.json();

  if (tempData.images) {
    let i = 0;
    const imgPaths: string[] = [],
      imgSeeds: string[] = [];

    for (const el of tempData.images) {
      fs.writeFileSync(`output_test${scriptId}_${i}.png`, Buffer.from(el, 'base64'));
      imgPaths.push(`./output_test${scriptId}_${i}.png`);

      const seed = await fetchSeed(url, el);
      imgSeeds.push(seed);
      i++;
    }

    logger.info(JSON.stringify({ imgPaths, prompt: text, seeds: imgSeeds }));
  } else if (tempData.imgPaths) {
    logger.info(
      JSON.stringify({
        imgPaths: tempData.imgPaths,
        prompt: text,
      }),
    );
  } else if (tempData.audioPath) {
    logger.info(
      JSON.stringify({
        audioPath: tempData.audioPath,
        prompt: text,
      }),
    );
  } else {
    throw new Error('Invalid response from server');
  }

  return;
};

(async () => {
  try {
    const prompt = 'racoon';
    const scriptConfigId = 'hjHcLFTEDjzVUyJD0VlkD2OzRlU7yFxxQGzIhXDfMiY'; // replace this with the script config tx id

    const registration: TestOperatorParams = {
      scriptId: 'test',
      ...(CONFIG.urls[scriptConfigId] as unknown as UrlConfig),
    };

    await inference(prompt, registration);
  } catch (error) {
    logger.error(error);
  }
})();
