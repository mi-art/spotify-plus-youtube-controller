# Spotify and Youtube, on the same page.

Switch between Spotify (Premium) and Youtube playback from a single web-page.

**<https://spotify-youtube.netlify.com/>**

-----------------

Details:

- if link above goes down, same page is hosted at https://mi-art.github.io/spotify-plus-youtube-controller/client-side/
- no data is collected, all javascript runs in your browser
- spotify api calls inspired from https://github.com/watsonbox/exportify and https://github.com/possan/playlistcreator-example
- can be tested locally with python 3
    ```
    cd ./client-side
    py -3 -m http.server 8888
    ```
- made with absolutely no experience in web dev before that project, feel free to send review comments
- future:
    - UI: configurable number of search results, tracks' thumbnails, paypal button to become rich
    - have a server variant to allow background token refresh
    - make use of spotify playback sdk to play from there directly
