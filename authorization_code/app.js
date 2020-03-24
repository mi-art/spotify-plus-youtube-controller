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
    // trick from https://stackoverflow.com/a/39333479 
    const sub = (({ name, uri }) => ({ name, uri }))(element);
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

app.get('/arthur_pause', function(req, res) {
  var access_token = global_token;

  var options = {
    url: 'https://api.spotify.com/v1/me/player/pause',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
  };

  console.log("Pause?");
  // use the access token to access the Spotify Web API
  request.put(options, function(error, response, body) {
    // do stuff with error?
    console.log("Pause.");
    res.end();
  });
});

var getSpotifyResults = function(search_input, callback_func) {
  // SPOTIFY
  var access_token = global_token;
  var options = {
    url: 'https://api.spotify.com/v1/search?query=' + encodeURIComponent(search_input) + '&type=track&offset=0&limit=3',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
  };
  // use the access token to access the Spotify Web API
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

// for now, only search on spotify (one day youtube too)
app.get('/arthur_search', function(req, res) {

  // COMMON
  var search_input = req.query.search_input;
  if (search_input == undefined || search_input.trim().length == 0)
  {
    res.send({
      error: 'Empty query'
    });
    res.end();
  } else {
    console.log('Looking for: ' + search_input);

    // YOUTUBE

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
 * Play input song on spotify.
 *
 * FIXME: doesn't always work when spotify app is sleeping ..  in that case,
 * GET https://api.spotify.com/v1/me/player returns nothing
 * in that case, we need to instanciate the webplayback stuff or
 * simply warn user to start his spotify
 */
app.get('/arthur_play', function(req, res) {
  var access_token = global_token;

  var uri = req.query.uri;
  console.log('Triggering ' + uri + ' at ' + new Date().toLocaleTimeString('fr-FR'));

  var values = {
    uris:[uri],
  };
  var options = {
    url: 'https://api.spotify.com/v1/me/player/play',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true,
    body:values,
  };

  request.put(options, function(error, response, body) {
    // do stuff with error?
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
