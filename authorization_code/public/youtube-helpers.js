var ytfy = {

  // sort of private vars
  arthur_vars: {
    player:null,
    tag:null,
    firstScriptTag:null,
    firstVideo:null,
  },

  playSpotifyOnVideoEnd:false,

  /** Create ytfy.arthur_vars.player */
  initializePlayer: function(first_video_uri){
    ytfy.arthur_vars.firstVideo = first_video_uri;

    // 2. This code loads the IFrame Player API code asynchronously.
    ytfy.arthur_vars.tag = document.createElement('script');

    ytfy.arthur_vars.tag.src = "https://www.youtube.com/iframe_api";
    ytfy.arthur_vars.firstScriptTag = document.getElementsByTagName('script')[0];
    ytfy.arthur_vars.firstScriptTag.parentNode.insertBefore(ytfy.arthur_vars.tag, ytfy.arthur_vars.firstScriptTag);
  },

  // 3. This function creates an <iframe> (and YouTube player)
  //    after the API code downloads.
  onYouTubeIframeAPIReady_internal: function() {
    ytfy.arthur_vars.player = new YT.Player('youtube-actual-player', {
      height: '270',  // minimum size required by Player API doc
      width: '100%',
      videoId: ytfy.arthur_vars.firstVideo,
      events: {
        'onReady': ytfy.onPlayerReady,
        'onStateChange': ytfy.onPlayerStateChange,
      },
    });

    // clear out firstVideo to have clear error if this was to be called again.
    ytfy.arthur_vars.firstVideo = null;
  },

  // 4. The API will call this function when the video player is ready.
  onPlayerReady: function(event) {
    event.target.playVideo();
    ytfy.showPlayer();  // if shown before, only the closing box appears
  },

  showPlayer: function() {
    $('#youtube-player').show();
  },
  /**
   * Play video based on its @param uri (e.g "M7lc1UVf-VE")
   *
   * On first call it loads all the youtube stuff and start vid.
   * On next calls, loaded player is reused thanks to ytfy.arthur_vars
   * global.
   */
  playVideo: function(uri) {
    if (ytfy.arthur_vars.player == null)
    {
      console.log('Create youtube player with ' + uri);
      ytfy.initializePlayer(uri);
    }
    else
    {
      console.log('Update youtube player with ' + uri);
      ytfy.arthur_vars.player.loadVideoById(uri);
      ytfy.showPlayer();
    }
  },

  /*
  * Called when video end. Trigger back spotify playback if needed.
  *
  * Note: Could fail because the device goes off after
  * couple of minutes paused.
  */
  resumeSpotifyIfNeeded: function() {
    if (ytfy.playSpotifyOnVideoEnd)
    {
      // reset flag
      ytfy.playSpotifyOnVideoEnd = false;

      $.ajax({
        url: "/arthur_play",
        error: function(XMLHttpRequest, textStatus, errorThrown) {
            console.log(XMLHttpRequest.responseText);
        },
      })
    }
  },

  onPlayerStateChange: function(event) {
    if (event.data == YT.PlayerState.ENDED ) {
      ytfy.resumeSpotifyIfNeeded();
    }
  },

  /** Stop youtube video if it had been initialized before */
  stopVideo: function() {
    if (ytfy.arthur_vars.player != null)
    {
      ytfy.arthur_vars.player.stopVideo();
    }
    $('#youtube-player').hide();
  },
};

function onYouTubeIframeAPIReady() { ytfy.onYouTubeIframeAPIReady_internal() };

function spotify_factory()
{
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
    apiCall: function(url, method, /*expected_status*/) {
      console.log(thaat.spotify_token);
      var options = {}

      return $.ajax({
        url: url,
        headers: {
          'Authorization': 'Bearer ' + thaat.spotify_token,
        },
        method:method,
      }).fail(function (jqXHR, textStatus) {
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
          console.log(response);
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

  };

  return thaat;
}
ytfy.apis_wrap = {
  spotify: spotify_factory(),
};
// main function
(function() {
  var params = ytfy.apis_wrap.spotify.getHashParams();
  // 'rate_limit_message' not handled so far
  if (typeof params['access_token'] === 'undefined') {
    console.log('not logged in :(')
  } else {
    console.log('logged in :)');// With token ' + params['access_token']);
    ytfy.apis_wrap.spotify.spotify_token = params['access_token'];
  }
})();
