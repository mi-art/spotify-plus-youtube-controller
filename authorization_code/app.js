/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var async = require("async");

var client_id = '33586b0c8c344403969b1e5553969279'; // Your client id
var client_secret = '560515e6eaf64f0abab59eb35652448a'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

////////////////// YOUTUBE EXAMPLE //////////////////
// initialize the Youtube API library
const {google} = require('googleapis');
const youtube = google.youtube({
  version: 'v3',
  auth: 'AIzaSyAxHmx63rVlGpFMMWP4UNH0-mV_Bwr8ez8',
});

var extractVideoInfo = function(items)
{
  var filtered = []; // subset of api results
  items.forEach(function(element) {
    const sub = {
      name: element.snippet.title,
      uri: element.id.videoId,
    };
    filtered.push(sub);
  });
  return filtered;
};

var getYoutubeResults = function(search_input, callback_func) {
  // https://developers.google.com/youtube/v3/docs/search/list
  // consider using videoCategoryId to only get Music videos
  const params = {
    part: 'id,snippet',  // useless snippet?
    q: search_input,
    maxResults : 3,
    type: ['video'],
  };

  youtube.search.list(params, (err, res) => {
    if (err) {
      console.error(err);
      throw err;  // should it be: callback_func(err); instead?????
    }
    var items = extractVideoInfo(res.data.items);
    callback_func(null, items);
  });
};
/////////////////////////////////////////////////////

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/**
 * Extract relevant keys from Spotify API track map.
 * Returns empty array if no tracks
 */
var extractTracksInfo = function(items) {
  var filtered = []; // subset of api results
  items.forEach(function(element) {
    const artists_str = element.artists.map(a => a.name).join(", ");
    const sub = {
      uri: element.uri,
      name: element.name + ' by ' + artists_str,
    };
    filtered.push(sub);
  });
  return filtered;
}

var stateKey = 'spotify_auth_state';

var global_token = '';
var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

var getSpotifyResults = function(search_input, callback_func) {
  var options = spotify_call_options(
    'https://api.spotify.com/v1/search?query='
    + encodeURIComponent(search_input)
    + '&type=track&offset=0&limit=3');
  request.get(options, function(error, response, body) {
    if (!error)
    {
      const filtered = extractTracksInfo(body.tracks.items);
      callback_func(null, filtered);
    } else {
      console.log('fuckery in search call results:');
      console.log(error);
      callback_func(error);
    }
  });
}

app.get('/arthur_search', function(req, res) {
  var search_input = req.query.search_input;
  if (search_input == undefined || search_input.trim().length == 0)
  {
    res.send({
      error: 'Empty query'
    });
    res.end();
  } else {
    console.log('Looking for: ' + search_input);

    async.parallel([
      getSpotifyResults.bind(null, search_input), // null for "this"
      getYoutubeResults.bind(null, search_input),
      ],
      function(err, results) {
        res.send({
          filtered:{
            spotify: results[0],
            youtube: results[1],
          }
        });
    });
  }
});

/**
 * Create a promise that is successful if there is an active
 * spotify device and returns the device name and whether its playing.
 * Fails if there is no active device.
 */
function playable_device()
{
  var promise = new Promise(function(resolve, reject) {
    var options = spotify_call_options('https://api.spotify.com/v1/me/player');
    request.get(options, function(error, response, body) {
      if (body == undefined)
      {
        reject('No device available');
      }
      else
      {
        resolve({
          device_name:body.device.name,
          is_playing:body.is_playing,
        });
      }
    });
  });
  return promise;
};

app.get('/spotify_active_device', function(req,res) {
  if (global_token == '')
  {
    // this should be in a generic method generating the auth part
    // and used for every url
    res.status(401).send('Not logged in Spotify');
  }
  else
  {
    playable_device().then(function (result) {
      res.send(result.device_name);
      res.end();
    }).catch(function (error) {
      res.send("NO DEVICE");
      res.end();
    })
  }
});

/** Generate option dict to pass to requests */
function spotify_call_options(url) {
  return {
    url: url,
    headers: { 'Authorization': 'Bearer ' + global_token },
    json: true,
  };
}

function sleepy_error(res)
{
  console.log('Spotify device fell asleep');
  res.status(503).send('Spotify device fell asleep, wake him up playing something!')
}

/**
 * Play input song on spotify.
 *
 * Doesn't always work when spotify app is sleeping ..  In that case,
 * return an error 503 and instruct user to refresh his spotify device.
 *
 * TODO: instanciate the spotify webplayback stuff and play there
 */
app.get('/arthur_play', function(req, res) {
  playable_device().then(function (result) {
    var options = spotify_call_options('https://api.spotify.com/v1/me/player/play');
    var uri = req.query.uri;
    if (uri)
    {
      console.log('Triggering ' + uri + ' at ' + new Date().toLocaleTimeString('fr-FR'));

      var values = {
        uris:[uri],
      };
      options.body = values;
    }
    else {
      console.log('Play again what was playing');
    }

    request.put(options, function(error, response, body) {
      if (!(!error && response.statusCode === 204)) {
        res.status(500).send('bloody hell');
      }
      res.end();
    });
  }).catch(function (error) {
    sleepy_error(res);
    res.end();
  });
});

/*
 * Add track to queue and skip playback to it.
 *
 * Note: Won't work if there was already some stuff in the queue.
 *
 * TODOs:
 *  - if many tracks in queue, we could clear it first, or even do next until reaching the track etc..
 *    we could also add a UI widget selecting the action to perform on spotify play button
 *  - Not done, but from  API doc"Due to the asynchronous nature of the issuance of the command,
 *   you should use the Get Information About The User’s Current Playback to check that your issued
 *   command was handled correctly by the player."
*/
app.get('/arthur_queue', function(req, res) {
  var uri = req.query.uri;

  playable_device().then(function (result) {
    async.series([
      function(callback) {
        var options = spotify_call_options('https://api.spotify.com/v1/me/player/queue?uri=' + uri);
        console.log('Queue ' + uri);

        request.post(options, function(error, response, body) {
          if (!error && response.statusCode === 204) {
            callback();
          } else {
            // question: does body.error.message will always be there?
            callback('queuing failed: ' + body.error.message);
          }
        });
      },
      function(callback) {
        console.log('Next');
        var options = spotify_call_options('https://api.spotify.com/v1/me/player/next');
        request.post(options, function(error, response, body) {
          if (!error && response.statusCode === 204) {
            callback();
          } else {
            callback('nexting failed: ' + body.error.message);
          }
        });
      },
    ]).catch(function (error) {
      console.log('something went wrong');
      console.log(error);
      res.status(500).send(error);
    })
  }).catch(function (error) {
    sleepy_error(res);
  }).finally(function (){
    res.end();
  });
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        global_token = access_token;  // store the token as global var. not good?

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log('Connection of user ' + body.email);
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

console.log('Listening on 8888');
app.listen(8888);
