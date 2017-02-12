var passport = require('passport');
var RunKeeperStrategy = require('passport-runkeeper').Strategy;

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
global.runkeeperAccessToken = runkeeperAccessToken;
global.passport = passport;