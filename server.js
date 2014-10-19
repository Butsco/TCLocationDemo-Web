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

//zk.user.info(function(err, info) {
//  console.log(info);
//});
//
//zk.notebooks.all(function(err, notebooks) {
//  console.log(notebooks);
//});
//
//zk.notes.inNotebook('c4017b21-0909-4f86-9f64-14ed406a0c18', function(err, notes) {
//  console.log(notes);
//});

// home page
var zk;
var resultSpecOptions = {
        includeTitle: true,
        includeContentLength: true,
        includeCreated: true,
        includeUpdated: true,
        includeDeleted: true,
        includeUpdateSequenceNum: true,
        includeNotebookGuid: true,
        includeTagGuids: true,
        includeAttributes: true,
        includeLargestResourceMime: true,
        includeLargestResourceSize: true
      };

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
//    var client = new Evernote.Client({
//      token: token,
//      sandbox: config.SANDBOX
//    });
    zk = zookeeper({token: token});
    console.log(token);

    zk.user.info(function(err, user) {
        req.session.user = user;
        io.emit('user', user);
//        console.log(user);
    });

    zk.notebooks.all(function(err, notebooks) {
      req.session.notebooks = notebooks;
      io.emit('notebooks', notebooks);
//      console.log(notebooks);

        req.session.notes = new Array();

        for(var i=0; i<notebooks.length; i++) {
            var n = notebooks[i];
            console.log("FIXING NOTES: "+ n.guid);
            zk.notes.inNotebook(n.guid, resultSpecOptions, function(err, notes) {

                if(notes[0]!=undefined)
                    io.emit('notes', notes[0].notebookGuid, notes);

                for(var j=0; j<notes.length; j++) {
                    var note = notes[j];
                    zk.notes.single(note.guid, function(err, data) {

                        io.emit('note', data);

        //                console.log(notes);
                    });

                }

//                console.log(notes);
            });
        }
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

      // redirect the user to authorize the token
      res.redirect(client.getAuthorizeUrl(oauthToken));
    }
  });

};

// OAuth callback
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

        console.log("AccessToken: " + oauthAccessToken);

        fs.writeFile(__dirname + '/session.txt', oauthAccessToken, function (err) {
          if (err) throw err;
          console.log('It\'s saved!');
        });

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


// funky shit
////var token = 'S=s1:U=8fb32:E=1507c192db2:C=14924680060:P=185:A=houbenkristof-7667:V=2:H=a31d970fdb300d9f8fdde52b4c7eaef0';
//var token = 'S=s1:U=8fb28:E=1507c23fb2b:C=1492472ce00:P=185:A=houbenkristof-7667:V=2:H=8ce18b0bf36bb90eeab8cc9b518d537d';
//
//var client = new Evernote.Client({
//      token: token,
//      sandbox: config.SANDBOX
//    });
////
////var noteStore = client.getNoteStore();
////noteStore.listNotebooks(function(err, notebooks){
////    if(notebooks == undefined) return;
////
////    console.log("NOTEBOOKS " + notebooks.length);
////    console.log(notebooks[0]);
////
////  for(var i=0; i<notebooks.length; i++) {
////      var n = notebooks[i];
////      console.log(n.name);
////      console.log(n.guid);
////
////      var filter = new Evernote.NoteFilter();
////      filter.ascending = true;
////      filter.notebookGuid = n.guid;
////
////      var rspec = new Evernote.NotesMetadataResultSpec();
////      rspec.includeTitle = true;
////      rspec.includeNotebookGuid = true;
////
////      noteStore.findNotesMetadata(authTokenEvernote, filter, 0, 100, rspec, function (notes) {
////		var data = {};
////		data.id = JSON.stringify(notes);
////		console.log(data);
////	  },function (error) {
////	    console.log('Error- ' + JSON.stringify(error));
////	  });
////  }
////
////});
