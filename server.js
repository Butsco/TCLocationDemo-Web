var Evernote = require('evernote').Evernote;
var zookeeper = require('evernote-zookeeper');

var path =  require('path');

var express = require('express');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var session = require('express-session');
var serveStatic = require('serve-static');
var errorhandler = require('errorhandler');
var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

var fs = require('fs');

var config = require("./config").config;

var env = process.env.NODE_ENV || 'development';
console.log("Environment: " + env);


// SETUP
app.set('port', 8000);

app.use(morgan('dev'));
app.use(bodyParser());
app.use(methodOverride());
app.use(cookieParser('secret'));
app.use(session());
app.use(function(req, res, next) {
    res.locals.session = req.session;
    next();
});
app.use(serveStatic(path.join(__dirname, 'static')));

if ('development' == env) {
   // configure stuff here
    app.use(errorhandler());
}

io.on('connection', function(socket){
  console.log('a user connected');

  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
});

http.listen(8000, function(){
  console.log('listening on 8000');
});



// home page
routes_index = function(req, res) {
    try {
        var token = fs.readFileSync(__dirname + '/session.txt');
        req.session.oauthAccessToken = String(token);
        console.log("known user: ---" + token + '---');
    }
    catch(err) {
        console.log("new user");
    }

  if(req.session.oauthAccessToken) {
    var token = req.session.oauthAccessToken;
    var client = new Evernote.Client({
      token: token,
      sandbox: config.SANDBOX
    });
    res.sendFile(__dirname + '/home.html');

    console.log();
  } else {
   res.sendFile(__dirname + '/index.html');
  }
};

// OAuth
var callbackUrl = "http://localhost:8000/oauth_callback";

routes_oauth = function(req, res) {
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });

  client.getRequestToken(callbackUrl, function(error, oauthToken, oauthTokenSecret, results){
    if(error) {
      req.session.error = JSON.stringify(error);
      res.redirect('/');
    }
    else {
      // store the tokens in the session
      req.session.oauthToken = oauthToken;
      req.session.oauthTokenSecret = oauthTokenSecret;

      console.log("Token: " + oauthToken);
      console.log("TokenSecret: " + oauthTokenSecret);

      fs.writeFile(__dirname + '/session.txt', oauthToken, function (err) {
          if (err) throw err;
          console.log('It\'s saved!');
        });

      // redirect the user to authorize the token
      res.redirect(client.getAuthorizeUrl(oauthToken));
    }
  });

};

// OAuth callback
var sessionDebug;
routes_oauth_callback = function(req, res) {
  var client = new Evernote.Client({
    consumerKey: config.API_CONSUMER_KEY,
    consumerSecret: config.API_CONSUMER_SECRET,
    sandbox: config.SANDBOX
  });

  client.getAccessToken(
    req.session.oauthToken,
    req.session.oauthTokenSecret,
    req.param('oauth_verifier'),
    function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
      if(error) {
        console.log('error');
        console.log(error);
        res.redirect('/');
      } else {
        // store the access token in the session
        req.session.oauthAccessToken = oauthAccessToken;
        req.session.oauthAccessTtokenSecret = oauthAccessTokenSecret;
        req.session.edamShard = results.edam_shard;
        req.session.edamUserId = results.edam_userId;
        req.session.edamExpires = results.edam_expires;
        req.session.edamNoteStoreUrl = results.edam_noteStoreUrl;
        req.session.edamWebApiUrlPrefix = results.edam_webApiUrlPrefix;

        sessionDebug = req.session;
        console.log(sessionDebug);

        res.redirect('/');
      }
    });
};

// Clear session
routes_clear = function(req, res) {
  req.session.destroy();
  res.redirect('/');
};

// retrieve session
routes_session = function(req,res){
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.session));
};

// Routes
app.get('/', routes_index);
app.get('/oauth', routes_oauth);
app.get('/oauth_callback', routes_oauth_callback);
app.get('/clear', routes_clear);
app.get('/session', routes_session);

