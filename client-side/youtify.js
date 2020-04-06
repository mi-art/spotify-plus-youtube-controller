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

        ytfy.spotify.playable_device()
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
     */
    load_youtube_search: function(){
      console.log('in load_youtube_search');
      gapi.client.setApiKey('AIzaSyAxHmx63rVlGpFMMWP4UNH0-mV_Bwr8ez8');
      return gapi.client.load('youtube', 'v3').then(function(){
        is_loaded = true;
        console.log('loaded!');
      });
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

    /**
     * Create a promise that is successful if there is an active
     * spotify device and returns the device name and whether its playing.
     * Fails if there is no active device.
     */
    playable_device: function ()
    {
      var promise = new Promise(function(resolve, reject) {
        thaat.api.call('https://api.spotify.com/v1/me/player', 'GET').then(function(response) {
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

    /**
     * Return a promise that resolve with the device name (or "NO DEVICE")
     */
    spotify_active_device: function() {
      if (thaat.spotify_token == '')  // not nice, should be handled by api.call
      {
        return $.Deferred().reject('Rejecting because no token');
      }
      else
      {
        return thaat.playable_device()
          .then(result => result.device_name)
          .catch(function (error) {
            return("NO DEVICE");
          });
      }
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
      return thaat.playable_device().then(
        function (result) {
          console.log(result);
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
      return thaat.playable_device().then(
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
    */
    queue: function(uri) {
      return thaat.playable_device()
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

  };  // end of thaat
  return thaat;
}

function common_factory()
{
  var thaat = {
    search: function(search_input){
      var promise;
      if (search_input == undefined || search_input.trim().length == 0)
      {
        alert('Empty query');
        promise = $.Deferred().reject('Rejecting because Empty query');
      }
      else
      {
        console.log('Looking for: ' + search_input);
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
var is_logged_in;  // TODO: move it inside spotify.api
// main function
(function() {

  is_logged_in = new Promise(function(resolve, reject) {
    try
    {
      var res = ytfy.spotify.api.retrieve_token().is_loggedin;
      console.log('is_loggedin: ', res);
      resolve(res);
    }
    catch (e)
    {
      reject(e);
    }
  });
})();
