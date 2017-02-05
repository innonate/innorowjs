var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var BleHR = require('heartrate');

// Setup for Calculations
var heartrate;
var cycles;
var lastCycleTime;
var lastCycleTimeDiff;
var lastWasAccelerating;
var strokes;
var stopWatchOn;
var startTime;
var resetCalcValues = function(){
  heartrate = [];
  cycles = [];
  lastCycleTime;
  lastCycleTimeDiff = 0;
  lastWasAccelerating = false;
  strokes = [];
  stopWatchOn = false;
  startTime;
}
resetCalcValues();

// sudo gatttool -t random -b F5:17:6D:3E:AD:86 -I
// primary

var updateHr = function(hr){
  date = new Date();
  time = date.getTime()/1000.0
  heartrate.unshift(parseInt([hr, time]));
  io.emit('heart rate label', 'HR');
  io.emit('heart rate', hr);
  if (heartrate.length % 10 == 0){
    lastTen = heartrate.slice(0,9)
    var sum = 0;
    for( var i = 0; i < lastTen.length; i++ ){
        sum += parseInt( lastTen[i][0], 10 ); //don't forget to add the base
    }
    var avg = Math.round(sum/lastTen.length);
    io.emit('heart rate label', 'Avg HR');
    io.emit('heart rate', avg);
  }
}

var hrMonitorUuid;
BleHR.list().on('data', function (device) {
  if (hrMonitorUuid == undefined && device.advertisement && /HRM/.exec(device.advertisement.localName)) {
    console.log("Found HRM: " + device.advertisement.localName)
    hrMonitorUuid = device.uuid;
    var blueOpts = {
      // "log": true,
      "uuid": hrMonitorUuid
    }
    var stream = new BleHR(blueOpts);
    stream.on('data', function(data){
      hr = data.toString();
      updateHr(hr);
    });
  }
});

var hallGpio = 17;
var ledGpio = 18;
var Gpio = require('pigpio').Gpio,
hall = new Gpio(hallGpio, {
  mode: Gpio.INPUT,
  edge: Gpio.EITHER_EDGE,
  alert: true
}),
led = new Gpio(ledGpio, {mode: Gpio.OUTPUT})

hall.on('alert', function (level) {
  if (level == 1) {
    date = new Date();
    time = date.getTime()/1000.0
    cycles.unshift(time);
    crpm = currentRpm(15)
    io.emit('rpm', crpm);
    io.emit('distance', (currentDistance(cycles) + 'M'));
    if (lastCycleTime == undefined) {
      lastCycleTime = time;
      accelerating = true
    } else {
      accelerating = ((time - lastCycleTime) > lastCycleTimeDiff) ? true : false
      lastCycleTimeDiff = time - lastCycleTime;
      lastCycleTime = time;
    }
    acceleration = accelerating ? 'Accelerating' : 'Decelerating'
    if (accelerating && (accelerating != lastWasAccelerating)) {
      io.emit('acceleration', 'New Stroke')
      strokes.unshift(time);
    } else {
      io.emit('acceleration', '---')
    }
    lastWasAccelerating = accelerating
    io.emit('stroke rate', strokeRate(15))
    if (crpm > 50) {
      led.digitalWrite(0);
    } else {
      led.digitalWrite(1);
    }
  }
});

app.get('/', function(req, res){
  res.sendfile('index.html');
});

io.on('connection', function(socket){
  socket.on('start timer', function(msg){
    resetCalcValues();
    startStopwatch();
  });
  socket.on('save data', function(msg){
    
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});

// # the wheel
var wheelRadius = 0.34 // meters
var wheelCircumference = 2 * Math.PI * wheelRadius    

var currentRpm = function(sensitivity=60){
  date = new Date();
  currentTime = date.getTime() / 1000.0;
  minuteAgo = currentTime - sensitivity
  relevant = cycles.filter(function (entry) { return entry >= minuteAgo; });
  return relevant.length * (60/sensitivity)
}

var currentDistance = function(arry){
  return Math.round((wheelCircumference * arry.length));
}

var fiveHundredSplit = function(){
  rpms_per_fhun = Math.round(500.0 / wheelCircumference)
  fhmago = cycles[rpms_per_fhun]
  if (fhmago == undefined) {
    return
  } else {
    date = new Date();
    currentTime = date.getTime() / 1000.0;
    return (fhmago - currentTime)/60 // minutes per 500m
  }
}

var strokeRate = function(sensitivity=60){
  date = new Date();
  currentTime = date.getTime() / 1000.0;
  minuteAgo = currentTime - sensitivity
  relevant = strokes.filter(function (entry) { return entry >= minuteAgo; });
  return relevant.length * (60/sensitivity)
}

var startStopwatch = function(){
  if ((stopWatchOn == undefined) || (stopWatchOn == false)){
    date = new Date();
    startTime = date.getTime()/1000.0
    stopWatchOn = true
    io.emit('stopwatch button value', 'Stop');
    setInterval(function(){
      if (stopWatchOn) {
        date = new Date();
        currentTime = date.getTime()/1000.0
        timeElapsed = Math.round(currentTime - startTime)
        if (timeElapsed <= 60) {
          clockValue = timeElapsed
        } else {
          minutes = Math.round(timeElapsed / 60)
          seconds = timeElapsed % 60
          clockValue = minutes + ':' + pad(seconds, 2)
        }
        io.emit('stopwatch time', clockValue);
      }
    }, 20);
  } else {
    resetCalcValues();
    io.emit('stopwatch button value', 'Restart');
  }
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}