# innorow.js
innorow uses a Hall Effect Sensor, Wahoo HR Monitor, Raspberry Pi, Node JS, and Socket IO to display a real-time dashboard of rowing data. I am using this for my Concept 2 Model A.

## Hardware Dependencies
- Raspberry Pi (I had a Raspberry Pi 1, Model B laying around)
- [Hall Effect Sensor Switch](https://www.amazon.com/SunFounder-Switch-Sensor-Arduino-Raspberry/dp/B013G5N03O/) ($5.99)
- [Magnet for bike spokes](https://www.amazon.com/CatEye-Cycle-Computer-Universal-Magnet/dp/B000OYFENU/) ($3.83)
- [Bluetooth 4.0 Dongle](https://www.amazon.com/gp/product/B00OH09OXS/) ($7.99)
- Wifi Dongle (already had one)
- HR Monitor with Bluetooth 4.0 (I had an original Wahoo HR 1.7 but [new ones](http://www.wahoofitness.com/devices/wahoo-tickr-heart-rate-strap) will work or the [Polar H7 HR monitors](https://www.polar.com/us-en/products/accessories/H7_heart_rate_sensor))

## Software Dependencies
- Bluez 5.39 (more recent versions weren't working with my HR monitor)
-- Don't skip [this step](https://urbanjack.wordpress.com/2014/06/05/how-to-set-bluez-into-ble-or-le-only-mode-ibeacon/)! You need `btmgmt` to work.
- Install the PIGPIO dependencies [mentioned here](https://github.com/fivdi/pigpio).

## Common issues
- If you're not sure how to get your UUID for your HR monitor, use the `BleHR.list.print()` method mentioned by the [Heartrate node module](https://github.com/mikaelbr/node-heartrate).
- If your HR monitor does not report on battery level (as was the issue with mine) you will need to comment out [Line 111](https://github.com/mikaelbr/node-heartrate/blob/master/lib/device.js#L111) of the HR module.

## Running innorowjs
After you've installed all the modules (`npm install`) and you can run innorow using `sudo -E node index.js`. Note: You must use `sudo` to have access to the Pi's GPIO and you must use `-E` so you can use your Runkeeper environment variables.

## Run innorow automatically on Pi startup
To run innorow automatically on your Pi's startup (so you can simply plug the Pi in to get started) then follow these directions:
- Install `chkconfig` via `sudo apt-get install chkconfig`
- Copy the file in `/startup_scripts/innorow` to `/etc/init.d/` and then `sudo chmod 755` the file
- Create a new file here `/etc/default/innorow` and add your Runkeeper client ID and client secret `RUNKEEPER_CLIENT_ID=<your id>
RUNKEEPER_CLIENT_SECRET=<your secret>`
- Run `sudo chkconfig --add innorow` to turn your service name into a startup script

## License
Copyright (c) 2017 Nate Westheimer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
