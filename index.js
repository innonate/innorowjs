var app = require('express')();
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


app.use(cookieParser());

var runkeeperAccessToken;
passport.use(new RunKeeperStrategy({
    clientID: process.env.RUNKEEPER_CLIENT_ID,
    clientSecret: process.env.RUNKEEPER_CLIENT_SECRET,
    callbackURL: "http://192.168.0.92:3000/auth/runkeeper/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    console.log('in the call back')
    runkeeperAccessToken = accessToken;
    return done(null, null);
  }
));


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

// sudo gatttool -t random -b F5:17:6D:3E:AD:86 -I
// primary

var updateHr = function(hr){
  date = new Date();
  time = date.getTime()
  heartrate.unshift([parseInt(hr), time]);
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
    io.emit('calories', totalCalories());
  }
}

var avgHeartRate = function(){
  var sum = 0;
  for( var i = 0; i < heartrate.length; i++ ){
      sum += parseInt( heartrate[i][0], 10 ); //don't forget to add the base
  }
  var avg = Math.round(sum/heartrate.length);
  return avg;
}

var totalCalories = function(){
  // Male: ((-55.0969 + (0.6309 x HR) + (0.1988 x W) + (0.2017 x A))/4.184) x 60 x T
  // Female: ((-20.4022 + (0.4472 x HR) - (0.1263 x W) + (0.074 x A))/4.184) x 60 x T
  // where
  // HR = Heart rate (in beats/minute)
  // W = Weight (in kilograms)
  // A = Age (in years)
  // T = Exercise duration time (in hours)
  HR = avgHeartRate();
  W = 90
  A = 34
  T = (timeElapsed/(60.0*60.0));
  return Math.round(((-55.0969 + (0.6309 * HR) + (0.1988 * W) + (0.2017 * A))/4.184) * 60 * T)
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
    resetCalcValues();
    startStopwatch();
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
    setInterval(function(){
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

// POST /fitnessActivities HTTP/1.1
// Host: api.runkeeper.com
// Authorization: Bearer xxxxxxxxxxxxxxxx
// Content-Type: application/vnd.com.runkeeper.NewFitnessActivity+json
// Content-Length: nnn
// RUNKEEPER_CLIENT_ID
// RUNKEEPER_CLIENT_SECRET

function postWorkoutToRunkeeper(){
  // An object of options to indicate where to post to
  // var post_options = {
  //     host: 'api.runkeeper.com',
  //     port: '80',
  //     path: '/fitnessActivities',
  //     method: 'POST',
  //     headers: {
  //         'Authorization': ('Bearer ' + runkeeperAccessToken),
  //         'Content-Type': 'application/vnd.com.runkeeper.NewFitnessActivity+json',
  //         'Content-Length': Buffer.byteLength(post_data)
  //     }
  // };
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
    "post_to_facebook": false,
    "post_to_twitter": false
  }
  sDate = new Date();
  sDate.setTime(startTime);
  startDate = dateFormat(sDate, "ddd, d mmm yyyy HH:MM:ss");
  console.log(startDate)
  basehash['start_time'] = startDate;
  for( var i = 0; i < heartrate.length; i++ ){
    hr = {
      'timestamp': (heartrate[i][1] - startTime),
      'heart_rate': heartrate[i][0]
    }
    basehash['heart_rate'].unshift(hr)
  }
  for( var i = 0; i < cycles.length; i++ ){
    dist = {
      'timestamp': (cycles[i] - (startTime/1000.0)),
      'distance': ((i+1)*wheelCircumference)
    }
    basehash['distance'].unshift(dist)
  }
  return basehash;
}