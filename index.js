var config = require('./config');
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var ejs = require('ejs');
var util = require('util');
var passport = require('passport');
var GitHubStrategy = require('passport-github2').Strategy;
var ecc = require('eccjs');
var PubNub = require('pubnub');
var https = require('https');
var fs = require('fs');

var xirsys = require('./xirsys.js');
var storage = require('node-persist');
storage.initSync();

var app = express();

// configure Express
app.set('views', __dirname + '/views');
app.set('view engine', 'html');
app.engine('html', ejs.renderFile);
app.use(express.static(__dirname + '/public'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


passport.serializeUser(function(user, done) {
  // Reading or generating a publicKey for the user

  var cachedUser = storage.getItem('user_' + user.id);

  if (cachedUser && 'secretKey' in cachedUser && 'publicKey' in cachedUser) {
    user.eccKey = cachedUser.eccKey;
    user.publicKey = cachedUser.publicKey;

    console.log('========');
    console.log('cachedUser.eccKey');

    done(null, user.id);

  } else { // if not in local storage, get from PubNub "DB"
    console.log('========');
    console.log('Getting from history...');

    // Using a PubNub channel (separated from the chat channel) as a DB

    var dbChannel = 'user_' + user.id;

    var db = new PubNub({
      subscribeKey: 'sub-c-981faf3a-2421-11e5-8326-0619f8945a4f',
      publishKey: 'pub-c-351c975f-ab81-4294-b630-0aa7ec290c58',
      secretKey: config.pubnub.secret_key,
      authKey: config.pubnub.auth_key,
    });
    db.grant({
      channels: [dbChannel],
      authKeys: [config.pubnub.auth_key],
      read: true,
      write: true,
      callback: function(m){console.log(m);} ,
      error: function(err){console.log(err);}
    });

    db.subscribe({
      channels: [dbChannel]
    });
    db.addListener({
      status: function(statusEvent) {
        console.log(statusEvent);
        if (statusEvent.category === "PNConnectedCategory") {

          db.history({
            channel: dbChannel
          },function(status, m) {

            console.log('======== ', m.messages.length);
            console.log(m);

            if(m.messages.length > 0) {
              console.log('========');
              console.log('User data found in history. No new key is generated.');

              user.eccKey = m.messages[0].eccKey;
              user.publicKey = m.messages[0].publicKey;
              storage.setItem('user_' + user.id, user);
              done(null, user.id);

            } else { // the user info is never stored in "DB" (history) before

              console.log('========');
              console.log('Nothing in history. Publishing new keys');

              var keys = ecc.generate(ecc.SIG_VER);
              user.eccKey = keys.sig;
              user.publicKey = keys.ver;
              storage.setItem('user_' + user.id, user);

              db.publish({
                channels: [dbChannel],
                message: user,
              }, function() {
                done(null, user.id);
              });
            }


          });
        }
      },
      message: function(message) {
        // handle message
      },
      presence: function(presenceEvent) {
        // handle presence
      }
    });
  }
});

passport.deserializeUser(function(id, done) {
  done(null, storage.getItem('user_' + id));
});

passport.use(new GitHubStrategy({
    clientID: config.auth.github.client_id,
    clientSecret: config.auth.github.client_secret,
    callbackURL: 'https://pubnub-auth-chat.herokuapp.com/callback'
    //callbackURL: 'http://localhost:3000/callback'
  },
  function(accessToken, refreshToken, profile, done) {
    var user = profile;
    user.accessToken = accessToken;
    return done(null, user); 
  }
));

var channel = 'am-ecc-chat';
var channelPres = channel + '-pnpres';

var pubnub = new PubNub({
  subscribeKey: 'sub-c-981faf3a-2421-11e5-8326-0619f8945a4f',
  publishKey: 'pub-c-351c975f-ab81-4294-b630-0aa7ec290c58',
  secretKey: config.pubnub.secret_key,
  authKey: config.pubnub.auth_key,
  ssl: true
});

pubnub.grant({
  channels: [channel + ',' + channelPres],
  authKeys: [config.pubnub.auth_key],
  read: true,
  write: true,
  callback: function(m){console.log(m);} ,
  error: function(err){console.log(err);}
});

//Routes

app.get('/', function (req, res) {

  res.render('index', { user: req.user });

  if(req.user) {
    pubnub.grant({
      channels: [channel + ',' + channelPres],
      authKeys: [req.user.accessToken],
      read: true,
      write: true,
      callback: function(m){console.log(m);} ,
      error: function(err){console.log(err);}
    });
  }
  pubnub.audit({
    callback: function(m){
      console.log(util.inspect(m, false, null));
    }
  });
});

app.get('/user/:id', function (req, res) {
  if(req.user) {
    try {
      var id = req.params.id;
      var cachedUser = storage.getItem('user_' + id);

      res.send({
        'publicKey': cachedUser.publicKey,
        'displayName': cachedUser.displayName,
        'username': cachedUser.username,
        'avatar_url': cachedUser._json.avatar_url,
        'id':  cachedUser.id
      });

    } catch (e) {
      res.send({'status': 404});
    }
  } else {
    res.send({'status': 403});
  }

});

app.get('/login',
  passport.authenticate('github', { scope: ['user']}),
  function(req, res) {
});
app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});
//Apply xirsys.turn middleware to retrieve the RTCIceServer dictionary
app.get('/callback', passport.authenticate('github', { failureRedirect: '/login' }), xirsys.turn,
  function(req, res) {
    res.redirect('/');
});
//Create HTTPS server
var httpsOptions = {
  key: fs.readFileSync('./app/cert/server.key')
  , cert: fs.readFileSync('./app/cert/server.crt')
};

https.createServer(httpsOptions, app).listen(3000, function (err) {
  if (err) {
    throw err
  }
  console.log('Secure server is listening on '+3000+'...');
});