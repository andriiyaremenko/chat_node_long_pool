var express = require('express'),
    url = require('url');

var port = 3000;
var events = {}
var pending = {};
var connectionTimeout = 60;
var maxAge = 60;
var lastRequestId = 0;
var app = express.createServer();

function compact(arr) {
    if (!arr) return null;
    var i, data = [];
    for (i=0; i < arr.length; i++) {
        if (arr[i]) data.push(arr[i]);
    }
    return data;
}

function currentTimestamp() {
    return new Date().getTime();
}

/**
 * Helper function for logging a debug message
 *
 * @param String user    - the username
 * @param int requestId  - the request id (optional)
 * @param String message - the message
 */
function debug(user, requestId, message) {
    if (message) {
        console.log("["+user+"/"+requestId+"] " + message);
    } else {
        console.log("["+user+"] " + requestId);
    }
}

/**
 * Adds a new event 'type' and optional 'data' for
 * the user.
 *
 * @param String user - the username
 * @param String type - the event type
 * @param Object data - an optional data object
 */
function addEvent(user, type, data) {
    if (!events[user])
        events[user] = [];

    var event = {
        type : type,
        timestamp : currentTimestamp()
    }
    if (data)
        event.data = data;

    events[user].push(event);
    debug(user, "P", "added " + JSON.stringify(event));
}

/**
 * Returns the next event for the user.
 *
 * The next event is the first (oldest) event after the
 * the 'timestamp'. If 'timestamp' is omitted the oldest
 * event which has not expired is returned.
 *
 * The 'timestamp' parameter represents the last event
 * the caller has seen and the function returns the
 * next event.
 *
 * While iterating over the events the function also
 * expires events which are older than maxAge seconds.
 *
 * @param String user   - the username
 * @param int timestamp - the timestamp of the last event
 * @returns Object      - an event or null
 */
function nextEvent(user, timestamp) {
    if (!events[user]) return null;
    if (!timestamp) timestamp = 0;

    // - loop over the events for the user
    // - timeout events older than maxAge seconds
    // - return the oldest event with a timestamp
    //   greater than 'timestamp'
    var event, i;
    var minTimestamp = currentTimestamp() - maxAge * 1000;
    for(i=0; i < events[user].length; i++) {
        event = events[user][i];

        // expire event?
        if (event.timestamp < minTimestamp) {
            debug(user, "expired " + JSON.stringify(event));
            events[user][i] = null;
            continue;
        }

        // next event?
        if (event.timestamp > timestamp) {
            break;
        }
    }

    // compact the event array
    events[user] = compact(events[user]);

    // return the event
    return event;
}

/**
 * Checks for all pending requests for the user
 * if an event is available. If an event is
 * available it is sent to the client and the
 * connection is closed.
 *
 * @param String user - the username
 */
function notify(user) {
    if (!pending[user]) return;

    // loop over pending requests for the user
    // and respond if an event is available
    var i, ctx, event;
    for (i=0; i < pending[user].length; i++) {
        ctx = pending[user][i];

        // ctx.req == null -> timeout, cleanup
        if (!ctx.req) {
            pending[user][i] = null;
            continue;
        }

        // get next event
        event = nextEvent(user, ctx.timestamp);

        // user has event? -> respond, close and cleanup
        if (event) {
            ctx.req.resume();
            ctx.res.send(event);
            ctx.res.end();
            pending[user][i] = null;
            debug(user, ctx.id, "sent " + JSON.stringify(event));
        }
    }

    // compact the list of pending requests
    pending[user] = compact(pending[user]);
}

/**
 * Pauses the current request for the user and
 * stores the request and response object in
 * the list of pending requests for the user
 *
 * @param String user      - the username
 * @param String timestamp - the timestamp filter of the request
 * @param Object req       - the request
 * @param Object res       - the response
 * @param int requestId    - the unique request id
 */
function pause(user, timestamp, req, res, requestId) {
    if (!pending[user])
        pending[user] = [];

    // save the request context
    var ctx = {
        id : requestId,
        timestamp : timestamp,
        req : req,
        res : res
    };
    pending[user].push(ctx);

    // configure a timeout on the request
    req.connection.setTimeout(connectionTimeout * 1000);
    req.connection.on('timeout', function(){
        ctx.req = null;
        ctx.res = null;
        debug(user, requestId, "timeout");
    });

    // pause the request
    req.pause();
    debug(user, requestId, "paused");
}

/**
 * GET handler for retrieving events for the user.
 * The username is required and the timestamp parameter
 * is optional.
 *
 * Example: GET /?user=joe&timestamp=1296564580384
 */
app.get('/', function(req, res) {
    var u = url.parse(req.url, true);

    // check for bad request
    if (!u.query || !u.query.user) {
        res.send(null, 400);
        return;
    }

    // add a close handler for the connection
    req.connection.on('close', function(){
        debug(user, requestId, "close");
    });

    // extract the parameters
    var user = u.query.user,
        timestamp = u.query.timestamp || 0,
        requestId = lastRequestId++;

    // get the next event
    var event = nextEvent(user, timestamp);

    // pause the request if there is no pending event
    // or send the event
    if (!event) {
        pause(user, timestamp, req, res, requestId);
    } else {
        res.send(event);
        res.end();
        debug(user, requestId, "sent " + JSON.stringify(event));
    }
});

/**
 * POST handler for adding a new event for the user.
 * The user and the type parameters are required.
 * The data object is in the body.
 */
app.post('/', function(req, res) {
    var u = url.parse(req.url, true);

    // check for bad request
    if (!u.query || !u.query.user || !u.query.type) {
        res.send('', 400);
        return;
    }

    // extract the parameters
    var user = u.query.user,
        type = u.query.type,
        data = u.data;

    // add the event
    addEvent(user, type, data);

    // notify pending requests
    notify(user);

    // send 200 OK
    res.send('', 200);
});

// start the server
app.listen(port);
console.log("Server started on port " + port);
