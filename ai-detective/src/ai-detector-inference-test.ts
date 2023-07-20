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

const prompt = `O say can you see, by the dawn's early light,
What so proudly we hail'd at the twilight's last gleaming,
Whose broad stripes and bright stars through the perilous fight
O'er the ramparts we watch'd were so gallantly streaming?
And the rocket's red glare, the bombs bursting in air,
Gave proof through the night that our flag was still there,
O say does that star-spangled banner yet wave
O'er the land of the free and the home of the brave?

On the shore dimly seen through the mists of the deep
Where the foe's haughty host in dread silence reposes,
What is that which the breeze, o'er the towering steep,
As it fitfully blows, half conceals, half discloses?
Now it catches the gleam of the morning's first beam,
In full glory reflected now shines in the stream,
'Tis the star-spangled banner - O long may it wave
O'er the land of the free and the home of the brave!

And where is that band who so vauntingly swore,
That the havoc of war and the battle's confusion
A home and a Country should leave us no more?
Their blood has wash'd out their foul footstep's pollution.
No refuge could save the hireling and slave
From the terror of flight or the gloom of the grave,
And the star-spangled banner in triumph doth wave
O'er the land of the free and the home of the brave.

O thus be it ever when freemen shall stand
Between their lov'd home and the war's desolation!
Blest with vict'ry and peace may the heav'n rescued land
Praise the power that hath made and preserv'd us a nation!
Then conquer we must, when our cause it is just,
And this be our motto - "In God is our trust,
And the star-spangled banner in triumph shall wave
O'er the land of the free and the home of the brave.`;

const inference = async function (text: string) {
  const res = await fetch(`${CONFIG.url}/`, {
    method: 'POST',
    body: text,
  });
  const tempData: string = await res.text();
  console.log(tempData);
  return tempData;
};

(async () => {
  await inference(prompt);
})();
