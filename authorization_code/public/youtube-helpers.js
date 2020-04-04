function youtube_player_factory()
{
  var thaat = {

    // sort of private vars
    arthur_vars: {
      player:null,
      tag:null,
      firstScriptTag:null,
      firstVideo:null,
    },

    playSpotifyOnVideoEnd:false,

    /** Create thaat.arthur_vars.player */
    initializePlayer: function(first_video_uri){
      thaat.arthur_vars.firstVideo = first_video_uri;

      // 2. This code loads the IFrame Player API code asynchronously.
      thaat.arthur_vars.tag = document.createElement('script');

      thaat.arthur_vars.tag.src = "https://www.youtube.com/iframe_api";
      thaat.arthur_vars.firstScriptTag = document.getElementsByTagName('script')[0];
      thaat.arthur_vars.firstScriptTag.parentNode.insertBefore(thaat.arthur_vars.tag, thaat.arthur_vars.firstScriptTag);
    },

    // 3. This function creates an <iframe> (and YouTube player)
    //    after the API code downloads.
    onYouTubeIframeAPIReady_internal: function() {
      thaat.arthur_vars.player = new YT.Player('youtube-actual-player', {
        height: '270',  // minimum size required by Player API doc
        width: '100%',
        videoId: thaat.arthur_vars.firstVideo,
        events: {
          'onReady': thaat.onPlayerReady,
          'onStateChange': thaat.onPlayerStateChange,
        },
      });

      // clear out firstVideo to have clear error if this was to be called again.
      thaat.arthur_vars.firstVideo = null;
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
     * On next calls, loaded player is reused thanks to thaat.arthur_vars
     * global.
     */
    playVideo: function(uri) {
      if (thaat.arthur_vars.player == null)
      {
        console.log('Create youtube player with ' + uri);
        thaat.initializePlayer(uri);
      }
      else
      {
        console.log('Update youtube player with ' + uri);
        thaat.arthur_vars.player.loadVideoById(uri);
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

        ytfy.spotify.playable_device()
        .then(
          () => ytfy.spotify.arthur_play(),
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
      if (thaat.arthur_vars.player != null)
      {
        thaat.arthur_vars.player.stopVideo();
      }
      $('#youtube-player').hide();
    },
  };

  return thaat;
}

function spotify_factory()
{
  function sleepy_error(error)
  {
    console.log(error);
    alert('Spotify device fell asleep, wake him up playing something!')
  }

  var thaat =  {
    spotify_token:null,

    /**
     * Obtains parameters from the hash of the URL
     * @return Object
     *
     * Taken from web-api-auth-examples/implicit-grant
     */
    getHashParams: function() {
      var hashParams = {};
      var e, r = /([^&;=]+)=?([^&;]*)/g,
          q = window.location.hash.substring(1);
      while ( e = r.exec(q)) {
          hashParams[e[1]] = decodeURIComponent(e[2]);
      }
      return hashParams;
    },

    /* Taken from web-api-auth-examples/implicit-grant */
    log_in: function() {
      var client_id = '33586b0c8c344403969b1e5553969279';
      var redirect_uri = 'http://localhost:8888/callback';

      var state = generateRandomString(16);

      localStorage.setItem(stateKey, state);
      var scope = 'user-read-private user-read-email user-modify-playback-state user-read-playback-state';

      var url = 'https://accounts.spotify.com/authorize';
      url += '?response_type=token';
      url += '&client_id=' + encodeURIComponent(client_id);
      url += '&scope=' + encodeURIComponent(scope);
      url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
      url += '&state=' + encodeURIComponent(state);

      window.location = url;
    },


    /** Taken from exportify */
    apiCall: function(url, method, body) {
      var options = {
        url: url,
        headers: {
          'Authorization': 'Bearer ' + thaat.spotify_token,
        },
        method:method,
      };
      if (body)
      {
        // https://stackoverflow.com/a/43268197
        options.dataType = 'json';
        options.data = JSON.stringify(body);
        options.contentType = 'application/json; charset=utf-8';
      }
      return $.ajax(options).fail(function (jqXHR, textStatus) {
        if (jqXHR.status == 401) {
          // Return to home page after auth token expiry
          window.location = window.location.href.split('#')[0]
        // } else if (jqXHR.status == 429) {
        //   // API Rate-limiting encountered
        //   window.location = window.location.href.split('#')[0] + '?rate_limit_message=true'
        } else {
          // Otherwise report the error so user can raise an issue
          alert(jqXHR.responseText);
        }
      })
    },


    /**
     * Create a promise that is successful if there is an active
     * spotify device and returns the device name and whether its playing.
     * Fails if there is no active device.
     */
    playable_device: function ()
    {
      var promise = new Promise(function(resolve, reject) {
        thaat.apiCall('https://api.spotify.com/v1/me/player', 'GET').then(function(response) {
          if (response == undefined)
          {
            reject('No device available');
          }
          else
          {
            resolve({
              device_name:response.device.name,
              is_playing:response.is_playing,
            });
          }
        });
      });
      return promise;
    },


    /** arthur_search */
    // use $.when() to have parallel calls
  /**
   * Stop spotify playback and return back whether it was playing
   * before. Does not throw if no active device or device already
   * stopped.
   * 
   * Return the promise
   */
    arthur_pause: function(req, res)
    {
      return thaat.playable_device().then(
        function (result) {
          console.log(result);
          if (result.is_playing)
          {
            // do actually Pause
            thaat.apiCall('https://api.spotify.com/v1/me/player/pause', 'PUT').fail(function(error){
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
    arthur_play: function(uri) {
      return thaat.playable_device().then(
        function (result) {
          if (uri)
          {
            console.log('Triggering ' + uri);

            var values = {uris: [uri]};
            thaat.apiCall('https://api.spotify.com/v1/me/player/play', 'PUT', values);
          }
          else if (result.is_playing)
          {
            console.log('Already playing and no track passed: do nothing');
          }
          else
          {
            console.log('Play again what was playing');
            thaat.apiCall('https://api.spotify.com/v1/me/player/play', 'PUT');
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
    */
    arthur_queue: function(uri) {
      return thaat.playable_device()
      .then(
        function () {
          async.series([
            function(callback) {
              console.log('Queue ' + uri);
              thaat.apiCall('https://api.spotify.com/v1/me/player/queue?uri=' + uri, 'POST')
              .then(function() {
                callback();
              });
            },
            function(callback) {
              console.log('Next');
              thaat.apiCall('https://api.spotify.com/v1/me/player/next', 'POST')
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

  };  // end of thaat
  return thaat;
}

var ytfy = {
  spotify: spotify_factory(),
  yt_player: youtube_player_factory(),
  // yt_search: TODO
};

function onYouTubeIframeAPIReady() { ytfy.yt_player.onYouTubeIframeAPIReady_internal() };


// main function
(function() {
  var params = ytfy.spotify.getHashParams();
  // 'rate_limit_message' not handled so far
  if (typeof params['access_token'] === 'undefined') {
    console.log('not logged in :(')
  } else {
    console.log('logged in :)');// With token ' + params['access_token']);
    ytfy.spotify.spotify_token = params['access_token'];
  }
})();
