/**
 * Helper functions to call youtube and spotify ytfy global var
 *
 * Implemented with some _factory function returning object. Would probably
 * make sense to convert them to proper class if it exists.
 * */
var ytfy = function()
{

function youtube_player_factory()
{
  // sort of private vars
  var private = {
    player:null,
    tag:null,
    firstScriptTag:null,
    firstVideo:null,
  };

  function page_domain() {return [location.protocol, '//', location.host].join('')};

  var thaat = {
    playSpotifyOnVideoEnd:false,

    /** Create private.player */
    initializePlayer: function(first_video_uri){
      private.firstVideo = first_video_uri;

      // 2. This code loads the IFrame Player API code asynchronously.
      private.tag = document.createElement('script');

      private.tag.src = "https://www.youtube.com/iframe_api";
      private.firstScriptTag = document.getElementsByTagName('script')[0];
      private.firstScriptTag.parentNode.insertBefore(private.tag, private.firstScriptTag);
    },

    // 3. This function creates an <iframe> (and YouTube player)
    //    after the API code downloads.
    onYouTubeIframeAPIReady_internal: function() {
      private.player = new YT.Player('youtube-actual-player', {
        height: '270',  // minimum size required by Player API doc
        width: '100%',
        videoId: private.firstVideo,
        events: {
          'onReady': thaat.onPlayerReady,
          'onStateChange': thaat.onPlayerStateChange,
        },
        playerVars:{origin: page_domain()},
      });

      // clear out firstVideo to have clear error if this was to be called again.
      private.firstVideo = null;
    },

    // 4. The API will call this function when the video player is ready.
    onPlayerReady: function(event) {
      event.target.playVideo();
      thaat.showPlayer();  // if shown before, only the closing box appears
    },

    showPlayer: function() {
      $('#youtube-player').show();
    },
    /**
     * Play video based on its @param uri (e.g "M7lc1UVf-VE")
     *
     * On first call it loads all the youtube stuff and start vid.
     * On next calls, loaded player is reused.
     *
     * FIXME: if playVideo triggered twice quickly, second call will
     *        crash because private.player not null but not fully
     *        loaded yet
     */
    playVideo: function(uri) {
      if (private.player == null)
      {
        console.log('Create youtube player with ' + uri);
        thaat.initializePlayer(uri);
      }
      else
      {
        console.log('Update youtube player with ' + uri);
        private.player.loadVideoById(uri);
        thaat.showPlayer();
      }
    },

    /*
    * Called when video end. Trigger back spotify playback if needed.
    *
    * Note: Could fail because the device goes off after
    * couple of minutes paused.
    */
    resumeSpotifyIfNeeded: function() {
      if (thaat.playSpotifyOnVideoEnd)
      {
        // reset flag
        thaat.playSpotifyOnVideoEnd = false;

        ytfy.spotify.player.playable_device()
        .then(
          () => ytfy.spotify.play(),
          function(error){
            console.log('Could not resume spotify (device probably fell asleep)');
            console.log(error);
          }
        );
      }
    },

    onPlayerStateChange: function(event) {
      if (event.data == YT.PlayerState.ENDED ) {
        thaat.resumeSpotifyIfNeeded();
      }
    },

    /** Stop youtube video if it had been initialized before */
    stopVideo: function() {
      if (private.player != null)
      {
        private.player.stopVideo();
      }
      $('#youtube-player').hide();
    },
  };

  return thaat;
}


function youtube_search_factory()
{
  var is_loaded = false;

  function extractVideoInfo(items)
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


  var thaat = {
    /**
     * Search for youtube videos. See spotify.search_track for @param callback_func
     *
     * Make sure the client is loaded and sign-in is complete before calling this method
     */
    search_videos: function (search_input, callback_func) {
      if (!is_loaded) throw 'google api not loaded yet';

      return gapi.client.youtube.search.list({
          "part": "id,snippet",
          "maxResults": 3,
          "q": search_input,
          "type": ["video"],
        })
        .then(
          function(response) {
            var items = extractVideoInfo(response.result.items);
            callback_func(null, items);
          },
          callback_func
        );
    },

    /**
     * Called once, on client.js onload.
     *
     * FIXME: Caling this as is from html raises Content Security Policy
     * warnings because it injects code from elsewhere. See:
     * - https://stackoverflow.com/a/13230948
     * - https://developer.mozilla.org/fr/docs/Web/HTTP/CSP
     */
    load_youtube_search: function(){
      gapi.client.setApiKey('AIzaSyAxHmx63rVlGpFMMWP4UNH0-mV_Bwr8ez8');
      return gapi.client.load('youtube', 'v3').then(function(){
        is_loaded = true;
      });
    },
  };
  return thaat;
}

/**
 * Wraps the device selection and initialize web-playback if needed.
 *
 *  @param api is the spotify api object
 */
function spotify_player_factory(api)
{
  var player = null;
  var _device_id = null;

  // https://stackoverflow.com/a/33843314
  const promiseTimeout = time => () => new Promise(resolve => setTimeout(resolve, time));

  /*
  * Promise that resolve when it was determined and handled whether web
  * playback was needed and if applicable initialized. This is needed to
  * allow user to trigger a song and actually send it once the device is
  * ready.
  */
  var notify_WebPlayback_handled;
  var notify_WebPlayback_crashed;
  var _wasWebPlaybackHandled;
  function reset_promise()
  {
    _wasWebPlaybackHandled = new Promise(function(resolve, reject)
    {
      notify_WebPlayback_handled = resolve;
      notify_WebPlayback_crashed = reject;
    });
  };
  reset_promise();

  // _wasWebPlaybackHandled.then(
  //   console.log.bind(null, '_wasWebPlaybackHandled: just resolved :)'),
  //   console.log.bind(null, '_wasWebPlaybackHandled: just rejected :(')
  // );

  var thaat = {
    /**
     * Create a promise that is successful if there is an active
     * spotify device and returns the device name and whether its playing.
     * If there is no device, it instantiate a local one and returns its name.
     * If local device cannot be created after few attempts, it fails.
     *
     *
     * If @param {boolean} wait_for_WebPlaybackHandled is false we don't
     * wait for spotify web playback, to avoid cyclical references (not nice?).
     * This also blocks other calls than the init one from onSDKReady().
     */
    playable_device: function()
    {
      const MAX_ATTEMPTS = 3;
      return _wasWebPlaybackHandled.then(thaat._playable_device.bind(null, MAX_ATTEMPTS));
    },

    // Call recursively until no more attempts are permitted
    _playable_device: function (remaining_attempts)
    {
      if (remaining_attempts <= 0)
      {
        return Promise.reject('Maximum number of attempts of device creation reached!');
      }

      return Promise.resolve()
        .then(function () {
          return api.call('https://api.spotify.com/v1/me/player', 'GET');
        })
        .then(function(response) {
          if (response == undefined)
          {
            // timeout needed because _handle_no_device will resolve when device is ready
            // but it takes a while to spotify api to get updated with new device id so we
            // wait to avoid many calls due to the recursion.
            const WAIT_MS = 1000;
            return thaat._handle_no_device()
                  .then(promiseTimeout(WAIT_MS))
                  .then(thaat._playable_device.bind(null, remaining_attempts - 1));  // recurse
          }
          else
          {
            notify_WebPlayback_handled();  // a bit ugly because called each time, but works..
            return({
              device_name:response.device.name,
              is_playing:response.is_playing,
            });
          }
        });
    },

    _handle_no_device: function()
    {
      // reject previous promise and reset it to pause other potential user calls
      notify_WebPlayback_crashed('no device (re-init needed)');
      reset_promise();

      return thaat._initPlayer().then(notify_WebPlayback_handled, notify_WebPlayback_crashed);
    },

    /**
     * Create player without starting it (will start on play call)
     *
     * Must be called when spotify logged in.
     *
     * TODO: add UI notification that we switched to WebPlayback
     */
    _initPlayer: function()
    {
      return new Promise(function(resolve_cb, reject_cb)
        {
          if (player != null)
          {
            // already created
            thaat._switch_to_WebPlayback().then(resolve_cb);
          }
          else
          {
            player = new Spotify.Player({
              name: 'Spotify and Youtube on the same page',
              getOAuthToken: api.getOAuthToken,
            });

            // Error handling
            player.addListener('initialization_error', console.error);
            player.addListener('authentication_error', console.error);
            player.addListener('account_error', console.error);
            player.addListener('playback_error', console.error);

            // Playback status updates
            // player.addListener('player_state_changed', console.log);

            // Ready
            player.addListener('ready', ({ device_id }) => {
              console.log('Ready with Device ID', device_id);
              _device_id = device_id;
              thaat._switch_to_WebPlayback()
              .then(resolve_cb, reject_cb);
            });

            // Not Ready
            player.addListener('not_ready', ({ device_id }) => {
              console.log('Device ID has gone offline', device_id);
            });

            // Connect to the player!
            player.connect().then(success => {
              if (!success) throw 'WebPlayback connection failed';
            });
          }
        });
    },

    /**
     * Switch to web playback device id. Must have been set before.
     *
     * NOTE: maybe 'not_ready' events should be checked, in case web player
     *       could go offline
     */
    _switch_to_WebPlayback: function()
    {
      if (_device_id == null) throw 'Internal device id is not set';

      // Switch to it
      // true:  switch AND start playback on input device even if nobody was playing before
      // false: switch to new device ONLY if there was no playing device. otherwise does nothing
      return api.call("https://api.spotify.com/v1/me/player", "PUT", {device_ids:[_device_id], play:false});
    },

    /**
     * Check whether logged-in, and attempt to retrieve playable_device, which internally
     * triggers web player init if needed.
     */
    onSDKReady: function()
    {
      api.logged()
      .then(
        // was logged
        () => thaat._playable_device(3).catch(alert),

        // catch was not logged (alert if other error)
        // cannot determine if WebPlayback needed as not logged in yet
        (e) => {
          if (e != 'not logged') alert(e);
        }
      );
    },
  };

  return thaat;
};

/**
 * Interface to spotify functionnalities
 */
function spotify_factory()
{
  // TODO: instantiate web-playback instead
  function sleepy_error(error)
  {
    console.log(error);
    alert('Spotify device fell asleep, wake him up playing something!')
  }

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


  var thaat =  {

    api: spotify_api_factory('client'),

    // thaat.api does not work. maybe real classes would fix that
    // https://stackoverflow.com/a/4616273
    init: function() {
      this.player = spotify_player_factory(this.api);
    },

    /**
     * Return a promise that resolve with the device name (or "NO DEVICE")
     */
    spotify_active_device: function() {
      return thaat.player.playable_device()
        .then(result => result.device_name)
        .catch(function (error) {
          return("NO DEVICE");
        });
    },


    /**
     * Get spotify tracks results for @param {string} search_input.
     *
     * @param {function} callback is used by async:
     * callback(error) if error, callback(null, result) if successful
     */
    search_tracks: function(search_input, callback) {
      const url = 'https://api.spotify.com/v1/search?query='
        + encodeURIComponent(search_input)
        + '&type=track&offset=0&limit=3'; // MAKE LIMIT A PARAM

      return thaat.api.call(url, 'GET').then(
        (results => callback(null, extractTracksInfo(results.tracks.items))),
        callback
      );
    },

    /**
     * Stop spotify playback and return back whether it was playing
     * before. Does not throw if no active device or device already
     * stopped.
     *
     * Return the promise
     */
    pause: function(req, res)
    {
      return thaat.player.playable_device().then(
        function (result) {
          if (result.is_playing)
          {
            // do actually Pause
            thaat.api.call('https://api.spotify.com/v1/me/player/pause', 'PUT').fail(function(error){
              console.log(' pause failed with :');
              console.log( error);
            });
            // request.put(options, function(error, response, body) {
              // response.statusCode should be checked
            return {was_playing: true};
          } else {
            //Was not playing
            return {was_playing: false};
          }
        },
        function (error) {
          // Catch missing device
          return ({
            error: error,
            was_playing: false
          });
        });
    },

    /**
     * Play input song on spotify.
     *
     * Doesn't always work when spotify app is sleeping ..  In that case,
     * raise an alert.
     *
     * TODO: instanciate the spotify webplayback stuff and play there
     * TODO: check play api no error and statusCode === 204
     */
    play: function(uri) {
      return thaat.player.playable_device().then(
        function (result) {
          if (uri)
          {
            console.log('Triggering ' + uri);

            var values = {uris: [uri]};
            thaat.api.call('https://api.spotify.com/v1/me/player/play', 'PUT', values);
          }
          else if (result.is_playing)
          {
            console.log('Already playing and no track passed: do nothing');
          }
          else
          {
            console.log('Play again what was playing');
            thaat.api.call('https://api.spotify.com/v1/me/player/play', 'PUT');
          }

        },
        function (error) {
          sleepy_error(error);
        });
    },

    /*
    * Add track to queue and skip playback to it.
    *
    * Note: Won't work if there was already some stuff in the queue.
    *
    * TODOs:
    *  - API statusCode 204 to check
    *  - if many tracks in queue, we could clear it first, or even do next until reaching the track etc..
    *    we could also add a UI widget selecting the action to perform on spotify play button
    *  - Not done, but from  API doc"Due to the asynchronous nature of the issuance of the command,
    *   you should use the Get Information About The User’s Current Playback to check that your issued
    *   command was handled correctly by the player."
    *
    * NOTE:
    *  - Spotify.Player#getCurrentState (from web-playback-sdk) gives access to the queue
    */
    queue: function(uri) {
      return thaat.player.playable_device()
      .then(
        function () {
          async.series([
            function(callback) {
              console.log('Queue ' + uri);
              thaat.api.call('https://api.spotify.com/v1/me/player/queue?uri=' + uri, 'POST')
              .then(function() {
                callback();
              });
            },
            function(callback) {
              console.log('Next');
              thaat.api.call('https://api.spotify.com/v1/me/player/next', 'POST')
              .then(function() {
                callback();
              });
            },
          ]).catch(function (error) {
            console.log('something went wrong in queuing or nexting');
            console.log(error);
          })
        },
        function (error) {
          sleepy_error(error);
        });
    },



  }; // end of thaat

  thaat.init();


  // Back to home page on token expiry
  thaat.api.token_expiry_side_effect = function()
  {
    alert('Spotify token expired, you will have to log in again');
    // window.location = window.location.href.split('#')[0];
  }

  thaat.api.authentification_failure_side_effect = function()
  {
    alert('There was an error during the authentication, you will have to log in again');
    // window.location = window.location.href.split('#')[0];
  }

  return thaat;
}

function common_factory()
{
  var thaat = {
    /**
     * Look for @param {string} search_input on both platforms and
     * @return {Promise} that resolves with an object of arrays or
     * an empty object if no input.
     * */
    search: function(search_input){
      var promise;
      if (search_input == undefined || search_input.trim().length == 0)
      {
        promise = Promise.resolve({});
      }
      else
      {
        promise = async.parallel({
          spotify: ytfy.spotify.search_tracks.bind(null, search_input), // null for "this"
          youtube: ytfy.yt_search.search_videos.bind(null, search_input), // null for "this"
        });
      }
      return promise;
    },
  };

  return thaat;
}

return {
  spotify: spotify_factory(),
  yt_player: youtube_player_factory(),
  yt_search: youtube_search_factory(),
  common: common_factory(),
};

}();   // end of ytfy "namespace"

// globals next to ytfy
var onYouTubeIframeAPIReady = ytfy.yt_player.onYouTubeIframeAPIReady_internal;
var googleApiClientReady = ytfy.yt_search.load_youtube_search;
var onSpotifyWebPlaybackSDKReady = ytfy.spotify.player.onSDKReady;
