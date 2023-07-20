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

const inference = async function (text: string) {
  const res = await fetch(`${CONFIG.url}/textToImage`, {
    method: 'POST',
    body: text,
  });
  const tempData: { imgPaths: string[] } = await res.json();

  return tempData.imgPaths;
};

(async () => {
  await inference('Anime art');
})();
