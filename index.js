var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
 var request = require('request');
var fs = require('fs');
var util = require('util')
var dateFormat = require('dateformat');
var BleHR = require('heartrate');
var passport = require('passport');
var RunKeeperStrategy = require('passport-runkeeper').Strategy;

// use cookies
app.use(cookieParser());

// prepare server
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap

// setup Runkeeper
var runkeeperAccessToken;
passport.use(new RunKeeperStrategy({
    clientID: process.env.RUNKEEPER_CLIENT_ID,
    clientSecret: process.env.RUNKEEPER_CLIENT_SECRET,
    callbackURL: "http://192.168.0.92:3000/auth/runkeeper/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    runkeeperAccessToken = accessToken;
    return done(null, null);
  }
));

// Setup for Health Data
var myAge = 33;
var myWeight = 90; // in kg
var myRestingHr = 58; // bpm

// Setup for Calculations
var heartrate;
var cycles;
var lastCycleTime;
var lastCycleTimeDiff;
var lastWasAccelerating;
var strokes;
var stopWatchOn;
var startTime;
var timeElapsed;
var resetCalcValues = function(){
  heartrate = [];
  cycles = [];
  lastCycleTime;
  lastCycleTimeDiff = 0;
  lastWasAccelerating = false;
  strokes = [];
  stopWatchOn = false;
  startTime;
  timeElapsed = 0;
}
resetCalcValues();

var updateHr = function(hr){
  date = new Date();
  time = date.getTime()
  heartrate.unshift([parseInt(hr), time]);
  io.emit('heart rate label', 'HR');
  io.emit('heart rate', hr);
  heatrateZone = fatBurningZone(parseInt(hr));
  io.emit('heart rate zone', heatrateZone);
  if (heartrate.length % 10 == 0){
    lastTen = heartrate.slice(0,9)
    var sum = 0;
    for( var i = 0; i < lastTen.length; i++ ){
        sum += parseInt( lastTen[i][0], 10 ); //don't forget to add the base
    }
    var avg = Math.round(sum/lastTen.length);
    io.emit('heart rate label', 'Avg HR');
    io.emit('heart rate', avg);
    io.emit('calories', totalCalories());
  }
}

var avgHeartRate = function(){
  if (!startTime) {
    relevantHr = heartrate;  
  } else {
    relevantHr = heartrate.filter(function (entry) { return entry[1] >= startTime });  
  }
  var sum = 0;
  for( var i = 0; i < relevantHr.length; i++ ){
      sum += parseInt( relevantHr[i][0], 10 ); //don't forget to add the base
  }
  var avg = Math.round(sum/relevantHr.length);
  return avg;
}

var fatBurningZone = function(hr){
  // http://www.active.com/fitness/articles/how-to-calculate-your-training-heart-rate-zones
  // warmup is anything lower
  fatBurningLo = calculateRange(0.5);
  fatBurningHi = calculateRange(0.75);
  aerobicLo = calculateRange(0.75);
  aerobicHi = calculateRange(0.85);
  thresholdLo = calculateRange(0.85);
  thresholdHi = calculateRange(0.90);

  // anaerobic is anything above
  if (hr < fatBurningLo){
    return 'WARMUP';
  } else if ((hr >= fatBurningLo) && (hr < fatBurningHi)) {
    return 'FAT_BURNING'
  } else if ((hr >= aerobicLo) && (hr < aerobicHi)) {
    return 'AEROBIC'
  } else if ((hr >= thresholdLo) && (hr < thresholdHi)) {
    return 'THRESHOLD'
  } else {
    return 'ANAEROBIC'
  }
}

var calculateRange = function(hrRange){
  maxHr = 220 - myAge;
  hrReserve = maxHr - myRestingHr
  theRange = (myRestingHr + (hrReserve*hrRange));
  return theRange;
}

var totalCalories = function(){
  // Using this formula: http://www.rowingmachineking.com/calories-burned-on-rowing-machine/
  // Male: ((-55.0969 + (0.6309 x HR) + (0.1988 x W) + (0.2017 x A))/4.184) x 60 x T
  // Female: ((-20.4022 + (0.4472 x HR) - (0.1263 x W) + (0.074 x A))/4.184) x 60 x T
  // where
  // HR = Heart rate (in beats/minute)
  // W = Weight (in kilograms)
  // A = Age (in years)
  // T = Exercise duration time (in hours)
  HR = avgHeartRate();
  W = myWeight 
  A = myAge
  T = (timeElapsed/(60.0*60.0)); // time divided by hours
  return Math.round(((-55.0969 + (0.6309 * HR) + (0.1988 * W) + (0.2017 * A))/4.184) * 60 * T)
}

var listenToHr = function(uuid){
  var blueOpts = {
    // "log": true,
    "uuid": uuid
  }
  var stream = new BleHR(blueOpts);
  stream.on('data', function(data){
    hr = data.toString();
    updateHr(hr);
  });
}

var hrMonitorUuid;
BleHR.list().on('data', function (device) {
  if (!hrMonitorUuid && device.advertisement && /HRM/.exec(device.advertisement.localName)) {
    console.log("Found HRM: " + device.advertisement.localName)
    hrMonitorUuid = device.uuid;
    listenToHr(hrMonitorUuid);
    return;
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
    io.emit('distance', currentDistance(cycles));
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
  if (runkeeperAccessToken) {
    res.cookie('runkeeperAccessToken' , runkeeperAccessToken);
  } else if (req.cookies.runkeeperAccessToken){
    runkeeperAccessToken = req.cookies.runkeeperAccessToken;
  }
  res.sendfile('index.html');
});

app.get('/auth/runkeeper', passport.authenticate('runkeeper'));

app.get('/auth/runkeeper/callback', passport.authenticate('runkeeper', {failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
});

io.on('connection', function(socket){
  socket.on('start timer', function(msg){
    if (msg == 'PAUSE'){
      pauseStopwatch()
    } else if (msg == 'CLEAR') {
      clearStopwatch();
    } else {
      startStopwatch();
    }
  });
  socket.on('save data', function(msg){
    postWorkoutToRunkeeper();
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
    startTime = date.getTime()
    stopWatchOn = true
    io.emit('stopwatch button value', 'Stop');
    var theStopWatch = setInterval(function(){
      if (stopWatchOn) {
        date = new Date();
        currentTime = date.getTime()/1000.0
        timeElapsed = Math.round(currentTime - (startTime/1000))
        if (timeElapsed <= 60) {
          clockValue = timeElapsed
        } else {
          minutes = Math.round(timeElapsed / 60)
          seconds = timeElapsed % 60
          clockValue = minutes + ':' + pad(seconds, 2)
        }
        io.emit('stopwatch time', clockValue);
      } else {
        clearInterval(theStopWatch);
      }
    }, 50);
  } else {
    clearStopwatch();
  }
}

var pauseStopwatch = function(){
  stopWatchOn = false
  io.emit('stopwatch button value', 'Clear Data');
}

var clearStopwatch = function(){
  resetCalcValues();
  io.emit('stopwatch button value', 'Start');
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

function postWorkoutToRunkeeper(){
  // POST /fitnessActivities HTTP/1.1
  // Host: api.runkeeper.com
  // Authorization: Bearer xxxxxxxxxxxxxxxx
  // Content-Type: application/vnd.com.runkeeper.NewFitnessActivity+json
  // Content-Length: nnn
  // RUNKEEPER_CLIENT_ID
  // RUNKEEPER_CLIENT_SECRET
  var post_options = {
    uri: '/fitnessActivities',
    baseUrl: 'http://api.runkeeper.com',
    method: 'POST',
    headers: {
      'Authorization': ('Bearer ' + runkeeperAccessToken),
      'Content-Type': 'application/vnd.com.runkeeper.NewFitnessActivity+json'
    },
    json: true,
    body: formatForRunkeeper()
  }
  request(post_options,function (error, response, body) {
    console.log('statusCode: '+ response.statusCode);
    if (error) {
      console.log(error)
      console.log(body)
    }
  });
}

function formatForRunkeeper(){
  currentTime = new Date();
  basehash = {
    "type": "Rowing",
    "equipment": "Row Machine",
    "start_time": "Sat, 1 Jan 2011 00:00:00",
    "utc_offset": '-28800',
    "duration": timeElapsed,
    "total_calories": totalCalories(),
    "total_distance": currentDistance(cycles),
    "source": 'innorow',
    "entry_mode": 'API',
    "tracking_mode": 'indoor',
    "has_path": false,
    "notes": "A row from the innorow",
    "average_heart_rate": avgHeartRate(),
    "heart_rate": [],
    "distance": [],
    "post_to_facebook": true,
    "post_to_twitter": false
  }
  sDate = new Date();
  sDate.setTime(startTime);
  startDate = dateFormat(sDate, "ddd, d mmm yyyy HH:MM:ss");
  basehash['start_time'] = startDate;
  relevantHr = heartrate.filter(function (entry) { return entry[1] >= sDate });
  for( var i = 0; i < relevantHr.length; i++ ){
    hr = {
      'timestamp': ((relevantHr[i][1] - startTime)/1000.0),
      'heart_rate': relevantHr[i][0]
    }
    basehash['heart_rate'].unshift(hr)
  }
  relevantCyles = cycles.filter(function (entry) { return entry >= sDate/1000.00; });
  for( var i = 0; i < relevantCyles.length; i++ ){
    dist = {
      'timestamp': (relevantCyles[i] - (startTime/1000.0)),
      'distance': ((i+1)*wheelCircumference)
    }
    basehash['distance'].unshift(dist)
  }
  return basehash;
}