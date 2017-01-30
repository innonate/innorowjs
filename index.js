var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// Setup for Calculations
var cycles = [];
var lastCycleTime;
var lastCycleTimeDiff = 0;

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
    cycles.push(time);
    crpm = currentRpm(15)
    io.emit('rpm', crpm);
    io.emit('distance', currentDistance(cycles));
    console.log(lastCycleTime);
    if (lastCycleTime == undefined) {
      console.log('Its undefined');
      lastCycleTime = time;
      acceleration = 'Accelerating'
    } else {
      accelerating = ((time - lastCycleTime) > lastCycleTimeDiff) ? true : false
      lastCycleTimeDiff = time - lastCycleTime;
      lastCycleTime = time;
      acceleration = accelerating ? 'Accelerating' : 'Decelerating'
    }
    time - lastCycleTime
    io.emit('acceleration', acceleration)
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

}

var strokeRate = function(){
  
}

var totalTime = function(){

}