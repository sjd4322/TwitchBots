//Env Variables for Twitch chat
const tmi = require('tmi.js');
const opts = require('./envVariables.json');

//Env Variables for Spotify
const spotifyHeaders = require('./spotifySettings.json')

//All the bs for jQuery to work on node.js
var jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { window } = new JSDOM();
const { document } = (new JSDOM('')).window;
global.document = document;
var $ = jQuery = require('jquery')(window);

//All the bs for connecting to Spotify
var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

//Connect to Twitch Client
const client = new tmi.client(opts);
client.on('message', onMessageHandler);
client.connect();

//Store the tokens for the application
var access_token = "",
refresh_token = "";

function onMessageHandler (target, context, msg, self) {
    if (self) { return; } 
  
    const commandName = msg.trim();    
    if(commandName === "!song"){
        $.ajax({
            url: 'https://api.spotify.com/v1/me/player/currently-playing',
            type: "GET",
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            success: function(spotifyInfo) {
                if(spotifyInfo !== undefined){
                   client.say(target, "Current Song: " + spotifyInfo.item.name + " by " + spotifyInfo.item.artists[0].name + " - " + spotifyInfo.item.external_urls.spotify); 
                }else{
                    client.say(target, "Clav's Spotify isn't open right now."); 
                }                
            },
            error: function(XMLHttpRequest, textStatus, errorThrown) { 
                console.log("Status: " + textStatus); 
                console.log("Error: " + errorThrown); 
            }    
        })
    }
}

var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

app.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);
  
    // your application requests authorization
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotifyHeaders.client_id,
            redirect_uri: spotifyHeaders.redirect_uri,
            scope: "user-read-currently-playing user-read-playback-state",
            state: state
    }));
});

app.get('/callback', function(req, res) {
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;
  
    if (state === null || state !== storedState) {
      res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        res.clearCookie(stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: spotifyHeaders.redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(spotifyHeaders.client_id + ':' + spotifyHeaders.client_secret).toString('base64'))
            },
            json: true
        };
  
        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
    
                access_token = body.access_token;
                refresh_token = body.refresh_token;
    
                var options = {
                    url: 'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                };

                // use the access token to access the Spotify Web API
                request.get(options, function(error, response, body) {
                    console.log(body);
                });

                // we can also pass the token to the browser to make requests from there
                res.redirect('/#' +
                querystring.stringify({
                    access_token: access_token,
                    refresh_token: refresh_token
                }));
            } else {
                res.redirect('/#' +
                querystring.stringify({
                    error: 'invalid_token'
                }));
            }
        });
    }
});
  
app.get('/refresh_token', function(req, res) {

    // requesting access token from refresh token
    var refresh_token = req.query.refresh_token;
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
        form: {
        grant_type: 'refresh_token',
        refresh_token: refresh_token
        },
        json: true
    };

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var access_token = body.access_token;
            res.send({
                'access_token': access_token
            });
        }
    });
});

app.listen(8888);