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

  // state is stored locally sent to spotify and compared against spotify returned value
  const stateKey = 'spotify_auth_state';

  var thaat = {
    token: null,

    /** Called on api.call failure (default: nothing) */
    token_expiry_side_effect: () => {},
    /** Called on hash param parsing failure (default: nothing) */
    authentification_failure_side_effect: () => {},

    /**
     * Log-in against spotify.com.
     *
     * After logging, spotify.com send us back a token to 'redirect_uri'.
     *
     * FIXME: stored stateKey stops user from going back to page without getting
     *        an ugly auth error alert
     */
    log_in: function () {
      var client_id = '33586b0c8c344403969b1e5553969279';
      var redirect_uri = [location.protocol, '//', location.host, location.pathname].join('');
      var state = generateRandomString(16);

      localStorage.setItem(stateKey, state);
      var scope = [
        'user-modify-playback-state', 'user-read-playback-state',
        "streaming", "user-read-email", "user-read-private" // for web-playback
      ].join(' ');

      var url = 'https://accounts.spotify.com/authorize';
      url += '?response_type=token';
      url += '&client_id=' + encodeURIComponent(client_id);
      url += '&scope=' + encodeURIComponent(scope);
      url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
      url += '&state=' + encodeURIComponent(state);
      // url += '&show_dialog=' + encodeURIComponent(true);

      window.location = url;
    },

    /**
     * To run at page loading to potentially read token from url after logging-in.
     *
     * TODO: add a callback param or return a promise?
     * TODO: clear error for non-premimum accounts
     * TODO: register timeout to ask for new token before expires_in
     *
     * NOTE: to remove that ugly url, we'd probably have to store the token locally
     *       and update $(location). see https://stackoverflow.com/a/59240665
     */
    retrieve_token: function() {
      var params = getHashParams();

      var access_token = params.access_token,
      state = params.state,
      storedState = localStorage.getItem(stateKey);

      if (access_token && (state == null || state !== storedState)) {
        thaat.authentification_failure_side_effect();
        return {is_loggedin:false};
      }
      else
      {
        localStorage.removeItem(stateKey);

        // 'rate_limit_message' not handled so far
        if (typeof params['access_token'] === 'undefined') {
          return {is_loggedin:false};
        } else {
          thaat.token = params['access_token'];
          return {is_loggedin:true};
        }
      }
    },

    _is_loggedin:null,  // unique (private) promise

    /**
     * @return {Promise} that resolves with loggedin status, and
     * reject on token parsing error. If called several times,
     * the same promise is returned (and not a new one).
     */
    is_loggedin: function() {
      if (thaat._is_loggedin == null)
      {
        thaat._is_loggedin = new Promise(function(resolve, reject) {
          try
          {
            var res = thaat.retrieve_token().is_loggedin;
            resolve(res);
          }
          catch (e)
          {
            reject(e);
          }
        });
      }

      return thaat._is_loggedin;
    },

    /** Call @param {Function} cb with spotify token (no check)*/
    getOAuthToken: cb => cb(thaat.token),

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
          thaat.token_expiry_side_effect();
        } else {
          // Otherwise report the error so user can raise an issue
          // status 429 (API Rate-limiting) not handled for now
          alert(jqXHR.responseText);
        }
      })
    },
  };

  return thaat;
}
