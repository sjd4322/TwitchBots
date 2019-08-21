//Connect to twitch chat
const tmi = require('tmi.js');
const opts = require('./envVariables.json');

//Twitch API Connect
const twitchApi = require("./twitchApiAuth.json");

//Connect to mongo and create a connection
const MongoClient = require('mongodb').MongoClient;
const uri = require('./mongoConnection.json');
const mongoClient = new MongoClient(uri.connectionString, { useNewUrlParser: true });
const connection = mongoClient.connect()

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

//Connect and set the event handlers
const client = new tmi.client(opts);
client.connect();

client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

//Store the tokens for the application
var access_token = "",
refresh_token = "";

function onMessageHandler (target, context, msg, self) {
    if (self) { return; } 

    const commandName = msg.trim();    

    if(commandName.startsWith('!rps')){
        var splitString = commandName.split(" ");
        if(splitString.length > 1){
            var challengedUser = splitString[1];
            console.log('Challenging ' + challengedUser);
            const connect = connection;
            connect.then(() => {
                var dbo = mongoClient.db("StevesBotDb").collection("Challenges");
                dbo.insert({ "startedBy" : context.username, "challenged" : challengedUser,
                            "startedByChoice" : "", "challengedChoice": "", "gameId" : "" });
                client.say(target, challengedUser + ", do you accept " + context.username + "'s challenge? !yes or !no");    
            });
        }else{
            client.say(target, context.username + ' input user you want to challenge! ex: !rps @Clavaat');
        }
        
    }else
    if(commandName === "!yes" || commandName === "!no"){
        handleChallengeAnswer(target, context, msg);
    }else   
    if (commandName === '!dice') {
        const num = rollDice();
        client.say(target, `You rolled a ${num}`);
    }else
    if( commandName === "!poop"){
        client.deletemessage(target, context.id);
    }else
    if(commandName === "!specs"){
        client.say(target, "CPU: i7 2600k - RAM: 16GB - GPU: GTX1070")
    }else
    if(commandName === "!related"){
        handleRelatedStreamers(target);
    }
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
        });
    }
};

function rollDice () {
    const sides = 6;
    return Math.floor(Math.random() * sides) + 1;
}

function onConnectedHandler () {
    console.log(`* Connected to Twitch, baby!`);
}

function handleChallengeAnswer(target, context, msg){
    const connect = connection;
    connect.then(() => {
        var dbo = mongoClient.db("StevesBotDb").collection("Challenges");
        dbo.findOne({ "challenged" : context.username }, function (err, result){
            if(result != null){
                const responseConnection = connection;
                responseConnection.then(() => {
                    var dbo = mongoClient.db("StevesBotDb").collection("Challenges");
                    if(msg === "!yes"){
                        client.say(target, result.startedBy + ' has accepted your challenge! The match ID is: ' + result.gameId);
                        dbo.update({"_id" : result._id}, {"gameId" : generateRandomString(4)})
                    }else{
                        dbo.remove({ "_id" : result._id});
                        client.say(target, result.startedBy + ' has declined your challenge!');
                    }    
                })
            }else{
                client.say(target, context.username + ' you have no open challenges.');
            }  
        });      
    });
}   

function handleRelatedStreamers(target){
    $.ajax({
        url: 'https://api.twitch.tv/helix/streams?user_login=Clavaat',
        type: "GET",
        headers: {
            'Client-ID': twitchApi.client_id
        },
        success: function(baseStream) {
            $.ajax({
                url: "https://api.twitch.tv/helix/streams?game_id=" + baseStream.data[0].game_id,
                type: "GET",
                headers: {
                    'Client-ID': twitchApi.client_id
                },
                success: function(results){
                    var streamers = results.data.filter(streamer => streamer.viewer_count < 75);

                    var returnString = "Support fellow small streamers! Related channels: ";
                    for(i=0; i < 5; i++){
                        returnString += i != 4 ?
                        "twitch.tv/" + streamers[i].user_name + ", " : 
                        "twitch.tv/" + streamers[i].user_name;
                    }

                    client.say(target, returnString);
                },
                error: function(XMLHttpRequest, textStatus, errorThrown) { 
                    console.log("Status: " + textStatus); 
                    console.log("Error: " + errorThrown); 
                } 
            })          
        },
        error: function(XMLHttpRequest, textStatus, errorThrown) { 
            console.log("Status: " + textStatus); 
            console.log("Error: " + errorThrown); 
        }    
    });
}

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

var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

app.listen(8888);