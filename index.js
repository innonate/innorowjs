var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
global.io = io;
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var path = require('path');
global.appRoot = path.resolve(__dirname);

// my app stuff
require(__dirname + '/config/passport.js')
var innorow = require(__dirname + '/lib/innorow.js')

// use cookies
app.use(cookieParser());

// prepare server
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js')); // redirect bootstrap JS
app.use('/js', express.static(__dirname + '/node_modules/jquery/dist')); // redirect JS jQuery
app.use('/js', express.static(__dirname + '/node_modules/react/dist')); // redirect react JS
app.use('/js', express.static(__dirname + '/node_modules/react-dom/dist')); // redirect react-dom JS
app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css')); // redirect CSS bootstrap
// serve static files
app.use(express.static(__dirname + '/public'));

// Here are the routes
app.get('/', function(req, res){
  if (runkeeperAccessToken) {
    res.cookie('runkeeperAccessToken' , runkeeperAccessToken);
  } else if (req.cookies.runkeeperAccessToken){
    runkeeperAccessToken = req.cookies.runkeeperAccessToken;
  } else {
    return res.redirect("/auth/runkeeper");
  }
  res.sendfile((__dirname + '/app/views/index.html'));
});

app.get('/auth/runkeeper', passport.authenticate('runkeeper'));

app.get('/auth/runkeeper/callback', passport.authenticate('runkeeper', {failureRedirect: '/' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
