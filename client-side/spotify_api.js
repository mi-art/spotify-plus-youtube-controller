/**
 * Wrapper abstracting spotify identification and api calls, for either
 * browser-only "Implicit grant" or server-side "Authorization Code".
 * 
 * So far only browser login is supported but server-side would have
 * the advantage of staying logged forever (thanks to the refresh token).
 *
 * FLOW                Access User Resources  Requires Secret Key (Server-Side)  Access Token Refresh
 * Authorization Code  Yes                    Yes                                Yes
 * Client Credentials  No                     Yes                                No
 * Implicit Grant      Yes                    No                                 No
 */


function spotify_api_factory(type) {

  if (![/*"server",*/ "client"].includes(type)) {
    throw 'Only client logging in supported so far';
  }

  /**
   * Obtains parameters from the hash of the URL
   * @return Object
   *
   * Taken from web-api-auth-examples/implicit-grant
   */
  function getHashParams() {
    var hashParams = {};
    var e, r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1);
    while (e = r.exec(q)) {
      hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
  }

  /**
   * Generates a random string containing numbers and letters
   * @param  {number} length The length of the string
   * @return {string} The generated string
   */
  function generateRandomString(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  const stateKey = 'spotify_auth_state';

  var thaat = {
    token: null,


    /**
     * Log-in against spotify.com.
     *
     * After logging spotify.com send us back a token to 'redirect_uri'.
     */
    log_in: function () {
      var client_id = '33586b0c8c344403969b1e5553969279';
      var redirect_uri = [location.protocol, '//', location.host, location.pathname].join('');
      var state = generateRandomString(16);

      localStorage.setItem(stateKey, state);
      var scope = 'user-modify-playback-state user-read-playback-state';

      var url = 'https://accounts.spotify.com/authorize';
      url += '?response_type=token';
      url += '&client_id=' + encodeURIComponent(client_id);
      url += '&scope=' + encodeURIComponent(scope);
      url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
      url += '&state=' + encodeURIComponent(state);

      window.location = url;
    },

    /**
     * To run at page loading to potentially read token from url after logging-in.
     *
     * TODO: add a callback param or return a promise?
     * TODO: clear error for non-premimum accounts
     * TODO: register timeout to ask for new token before expires_in
     */
    retrieve_token: function() {
      var params = getHashParams();

      var access_token = params.access_token,
      state = params.state,
      storedState = localStorage.getItem(stateKey);

      if (access_token && (state == null || state !== storedState)) {
        throw 'There was an error during the authentication';
      }
      else
      {
        localStorage.removeItem(stateKey);

        // 'rate_limit_message' not handled so far
        if (typeof params['access_token'] === 'undefined') {
          console.log('not logged in :(')
          return {is_loggedin:false};
        } else {
          console.log('logged in :)');
          thaat.token = params['access_token'];
          return {is_loggedin:true};
        }
      }
    },


    /** Call spotify api */
    call: function (url, method, body) {
      var options = {
        url: url,
        headers: {
          'Authorization': 'Bearer ' + thaat.token,
        },
        method: method,
      };
      if (body) {
        // https://stackoverflow.com/a/43268197
        options.dataType = 'json';
        options.data = JSON.stringify(body);
        options.contentType = 'application/json; charset=utf-8';
      }
      return $.ajax(options).fail(function (jqXHR, textStatus) {
        if (jqXHR.status == 401) {
          // TODO: Return to home page after auth token expiry
          alert('token expiry');
          //window.location = window.location.href.split('#')[0]
          // } else if (jqXHR.status == 429) {
          //   // API Rate-limiting encountered
          //   window.location = window.location.href.split('#')[0] + '?rate_limit_message=true'
        } else {
          // Otherwise report the error so user can raise an issue
          alert(jqXHR.responseText);
        }
      })
    },
  };

  return thaat;
}
