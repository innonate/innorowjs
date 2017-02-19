var request = require('request');
var fs = require('fs');
var util = require('util')
var dateFormat = require('dateformat');
var BleHR = require('heartrate');
var Gpio = require('pigpio').Gpio;
var bodyMeasurements = require(appRoot + '/config/constants.js')

// Setup for Calculations
var heartrate;
var cycles;
var lastCycleTime;
var lastCycleTimeDiff;
var lastWasAccelerating;
var strokes;
var stopWatchState;
var startTime;
var timeElapsed;
var resetCalcValues = function(){
  heartrate = [];
  clearCycles();
  lastCycleTime = undefined;
  lastCycleTimeDiff = 0;
  lastWasAccelerating = false;
  strokes = [];
  stopWatchState = 'NOT_STARTED';
  startTime = undefined;
  timeElapsed = 0;
}

var updateHr = function(hr){
  hrPayload = {}
  date = new Date();
  time = date.getTime()
  heartrate.unshift([parseInt(hr), time]);
  heatrateZone = fatBurningZone(parseInt(hr));
  hrPayload.label = 'HR';
  hrPayload.hr = hr;
  hrPayload.heatrate_zone = heatrateZone;
  if (heartrate.length % 10 == 0){
    lastTen = heartrate.slice(0,9)
    var sum = 0;
    for( var i = 0; i < lastTen.length; i++ ){
        sum += parseInt( lastTen[i][0], 10 ); //don't forget to add the base
    }
    avg = Math.round(sum/lastTen.length);
    heatrateZone = fatBurningZone(parseInt(hr));
    hrPayload.label = 'Avg HR';
    hrPayload.hr = avg;
    hrPayload.heatrate_zone = fatBurningZone(parseInt(avg));
    io.emit('calories', totalCalories());
  }
  io.emit('heart rate payload', hrPayload);
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
  result = isNaN(avg) ? 0 : avg
  return result;
}

var calculateRange = function(hrRange){
  maxHr = 220 - bodyMeasurements.myAge;
  hrReserve = maxHr - bodyMeasurements.myRestingHr
  theRange = (bodyMeasurements.myRestingHr + (hrReserve*hrRange));
  return theRange;
}

// http://www.active.com/fitness/articles/how-to-calculate-your-training-heart-rate-zones
// warmup is anything lower
var fatBurningLo = calculateRange(0.5);
var fatBurningHi = calculateRange(0.75);
var aerobicLo = calculateRange(0.75);
var aerobicHi = calculateRange(0.85);
var thresholdLo = calculateRange(0.85);
var thresholdHi = calculateRange(0.90);
var fatBurningZone = function(hr){
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
  W = bodyMeasurements.myWeight 
  A = bodyMeasurements.myAge
  T = (timeElapsed/(60.0*60.0)); // time divided by hours
  total = Math.round(((-55.0969 + (0.6309 * HR) + (0.1988 * W) + (0.2017 * A))/4.184) * 60 * T)
  return Math.abs(total)
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
hall = new Gpio(hallGpio, {
  mode: Gpio.INPUT,
  edge: Gpio.RISING_EDGE,
  alert: true
})

hall.on('alert', function (level) {
  if (level == 1) {
    cyclePayload = {};
    date = new Date();
    time = date.getTime()/1000.0
    if (stopWatchState == 'ON' || stopWatchState == 'NOT_STARTED'){
      // Record the cycle if you haven't started or if you're working out.
      cycles.unshift(time);
      crpm = currentRpm(15)
      cyclePayload.rpm = crpm;
      cyclePayload.distance = currentDistance();
      cyclePayload.split = fiveHundredSplit(10);
    }
    cyclePayload.acceleration = detectStroke(time);
    cyclePayload.stroke_rate = strokeRate();
    io.emit('cycle', cyclePayload);
  }
});

var currentlyExercising = function(){
  if ((stopWatchState == 'ON') || (stopWatchState == 'PAUSED')){
    return true;
  } else {
    return false;
  }
}

// # the wheel
const wheelRadius = 0.34 // meters
const wheelCircumference = 2 * Math.PI * wheelRadius

// As per https://github.com/stevescot/OpenRowingCode/blob/master/ArduniorowComputer/mainEngine.ino#L91
// The figure used for c is somewhat arbitrary - selected to indicate a 'realistic' boat speed for a given output power.
// c/p = (v)^3 where p = power in watts, v = velocity in m/s  so v = (c/p)^1/3 v= (2.8/p)^1/3
// Concept used to quote a figure c=2.8, which, for a 2:00 per 500m split (equivalent to u=500/120=4.17m/s) gives 203 Watts. 
const c = 2.8;
const k = 0.000135;
const mPerClickFancy = Math.pow((k/c),(0.33333333333333333)) * 2 * Math.PI;

// pick your poison
// neither of the above seem to be correct, so i'm trying to target slightly above 2:00/500m split at my
// normal pace until we can make this more scientific
var mPerClick = 0.8;

var currentRpm = function(sensitivity=60){
  date = new Date();
  currentTime = date.getTime() / 1000.0;
  minuteAgo = currentTime - sensitivity
  relevant = cycles.filter(function (entry) { return entry >= minuteAgo; });
  return relevant.length * (60/sensitivity)
}

var currentDistance = function(){
  // This is inefficient! So let's just clear the cycles array when startStopwatch is pressed
  // if (currentlyExercising()) {
  //   relevantCycles = cycles.filter(function (entry) { return entry >= startTime/1000.0 });
  // } else {
  //   relevantCycles = cycles
  // }
  relevantCycles = cycles
  return Math.round((mPerClick * relevantCycles.length));
}

var fiveHundredSplit = function(sensitivity=500.0){
  rpms_per_fhun = Math.round(sensitivity / mPerClick)
  multiplier = 500.0/sensitivity
  // rpms_per_fhun = Math.round(500.0 / wheelCircumference)
  fhmago = cycles[rpms_per_fhun]
  if (fhmago == undefined) {
    clockValue = 0
  } else {
    clockValue = Math.round((cycles[0] - fhmago)*multiplier)
  }
  if (clockValue <= 60) {
    return clockValue;
  } else {
    minutes = Math.round(clockValue / 60)
    seconds = clockValue % 60
    return (minutes + ':' + pad(seconds, 2))
  }
}

var detectStroke = function(time){
  chunkSize   = 10;
  recentChunk = 0;
  previoChunk = 0;
  for( var i = 0; i < (chunkSize*2); i++ ){
    diff = (cycles[i] - cycles[i+1]);
    if (isNaN(diff)){
      // do nothing
    } else {
      if (i>=chunkSize){
        previoChunk += diff;
      } else {
        recentChunk += diff;
      }
    }
  }
  currentlyAccelerating = (recentChunk < previoChunk) ? true : false
  if (currentlyAccelerating && !lastWasAccelerating){
    strokes.push(time);
    result = true;
  } else {
    result = false;
  }
  lastWasAccelerating = currentlyAccelerating;
  return result;
}

var strokeRate = function(sensitivity=60){
  date = new Date();
  currentTime = date.getTime() / 1000.0;
  minuteAgo = currentTime - sensitivity
  // relevant = strokes.filter(function (entry) { return entry >= minuteAgo; });
  relevant = 0;
  var i = strokes.length;
  do {
     i -= 1;
     relevant += 1
  } while (strokes[i] >= minuteAgo);
  // return relevant.length * (60/sensitivity)
  return relevant * (60/sensitivity)
}

var clearCycles = function(){
  cycles = [];
}

var startStopwatch = function(){
  if ((stopWatchState == 'NOT_STARTED') || (stopWatchState == 'PAUSED')){
    if (stopWatchState == 'NOT_STARTED'){
      date = new Date();
      startTime = date.getTime()
      clearCycles();
    }
    stopWatchState = 'ON'
    io.emit('stopwatch button value', 'Stop');
    var theStopWatch = setInterval(function(){
      if (stopWatchState == 'ON') {
        date = new Date();
        currentTime = date.getTime()/1000.0
        timeElapsed = Math.round(currentTime - (startTime/1000))
        if (timeElapsed <= 60) {
          clockValue = timeElapsed
        } else {
          minutes = Math.floor(timeElapsed / 60)
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
  stopWatchState = 'PAUSED'
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
  console.log(post_options);
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
    "utc_offset": '-8',
    "duration": timeElapsed,
    "total_calories": totalCalories(),
    "total_distance": currentDistance(),
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
  for( var i = 0; i < cycles.length; i++ ){
    dist = {
      'timestamp': (cycles[i] - (startTime/1000.0)),
      'distance': ((i+1)*wheelCircumference)
    }
    basehash['distance'].unshift(dist)
  }
  return basehash;
}

// Listen to io for stop watching and posting
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

// When loading the app, reset all the values
resetCalcValues();