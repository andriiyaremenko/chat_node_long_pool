var app = require('express')();
var requests = [];
var messages = [];
var users = [];
var getMessages = function(arr, who){
  var result = arr.filter(function(el){
    return el.to.indexOf(who) != -1||el.to.length==1;});
  return result;
};

app.get('/getUserList', function(req, res){
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(JSON.stringify({list: users}));
});
app.post('/postName', function(req, res){
  req.on('data', function(data){
    users.push(JSON.parse(data).name);
  });
  res.end("");
});
app.post('/postMessage', function(req, res){
  req.on('data', function(data){
    messages.push(JSON.parse(data));
  });
  res.end("");
});
app.get('/getUpdates', function(req, res){
  requests.push({
		res: res,
		timestamp: new Date().getTime(),
    name: req.query.name,
    lastMsg: parseInt(req.query.lastMsg),
    lastUsr: parseInt(req.query.lastUsr),
    sumLast: parseInt(req.query.lastMsg) + parseInt(req.query.lastUsr)
	});
});

setInterval(function() {
  // close out requests older than 30 seconds
  var expiration = new Date().getTime() - 30000;
  var sumUsrMsg = users.length + messages.length;
  for (var i = requests.length - 1; i >= 0; i--) {
    if (requests[i].timestamp<expiration||requests[i].sumLast<sumUsrMsg) {
      var reply = {};
      var res = requests[i].res;
      var lastMsg = requests[i].lastMsg;
      var lastUsr = requests[i].lastUsr;
      var name = requests[i].name;
      if(messages.length > lastMsg){
        reply.messages = getMessages(messages.slice(lastMsg), name);
        reply.lastMsg = messages.length;
      };
      if(users.length > lastUsr){
        reply.users = users.slice(lastUsr);
        reply.lastUsr = users.length;
      };
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(JSON.stringify(reply));
      requests.splice(i, 1);
    }
  }
}, 1000);

app.get('/', function(req, res){
  res.sendfile('cometChat.html');
});

app.listen(8000, function(){
  console.log('listening on *: 8000')
});
