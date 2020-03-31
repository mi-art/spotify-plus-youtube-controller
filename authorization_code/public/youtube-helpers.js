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
