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
