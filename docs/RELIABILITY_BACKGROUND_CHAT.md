# Background Chat Reliability

Interactive Wetapp text requests pause their local attempt timeout while the page is hidden and resume with the remaining visible-time budget when it returns to the foreground. This does not create server-side jobs: if Android or the browser terminates the page/PWA process, the in-flight request cannot be guaranteed to finish.

Automatic memory updates without an upstream user request signal keep their existing fixed timeout.
