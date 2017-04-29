'use strict';

const express = require("express");
const app = express();
const server = require('http').Server(app);
const io = require('socket.io').listen(server);
const webPush = require("web-push");
const atob = require('atob');
const bodyParser = require('body-parser');
const util = require('util');

// Infomations for notification program
let subscribers = [];
let isSales = false;
let personType = "friend";

// ENV Variables
let VAPID_SUBJECT = process.env.VAPID_SUBJECT;
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

//Auth secret used to authentication notification requests.
let AUTH_SECRET = process.env.AUTH_SECRET;

// The list of subscribers
let sub = Object.create({});

// The list of available channels
let ch  = Object.create({});

// Varidate ENV vars
if (!VAPID_SUBJECT) {
  return console.error('VAPID_SUBJECT environment variable not found.')
} else if (!VAPID_PUBLIC_KEY) {
  return console.error('VAPID_PUBLIC_KEY environment variable not found.')
} else if (!VAPID_PRIVATE_KEY) {
  return console.error('VAPID_PRIVATE_KEY environment variable not found.')
} else if (!AUTH_SECRET) {
  return console.error('AUTH_SECRET environment variable not found.')
}

app.use("/app", express.static("dist"))
app.use("/notificator_setting", express.static("dist/notificator"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

webPush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

app.get('/status', function (req, res) {
  res.send('Server Running!');
});

app.post('/status/sales', function (req, res) {
	if(req.get('auth-secret') != AUTH_SECRET) {
		return res.sendStatus(401);
	}
	console.log(req.body)
	console.log(isSales)
	isSales = req.body['isSales'] || false;
	res.send('Sales changed!');
});

app.post('/status/types', function (req, res) {
	if(req.get('auth-secret') != AUTH_SECRET) {
		return res.sendStatus(401);
	}
	console.log(req.body)
	if (req.body['type'] == "random") {
		let typeArray = ["friend", "neighbor", "danger"];
		personType = typeArray[Math.floor(Math.random() * typeArray.length)];
	  console.log(personType)
	} else	{
		personType = req.body['type'] || "friend";
	}
	res.send('Type changed!');
});

app.get('/notify/all', function (req, res) {
  if ((req.get('auth-secret') != AUTH_SECRET) || isSales) {
    console.log("Missing or incorrect auth-secret header. or, She or He is sales. Rejecting request.");
    return res.sendStatus(401);
  }

  let message;
  let clickTarget;
	let title;
	let imgName;

	switch (personType) {
		case 'friend':
			title = "お友達がいらっしゃいました!";
			message = "楽しい時をお過ごしください。";
			imgName = "friend.jpg";
			break;
		case 'neighbor':
			title = "ご近所の方がいらっしゃいました！";
			message = "地域のつながりを育みましょう。";
			imgName = "neighbor.jpg";

			break;
		case 'danger':
			title = "見知らぬお客様です。";
			message = "訪問販売，詐欺には十分注意してください。";
			imgName = "danger.jpg";

			break;
		default:
			message = req.query.message || `Willy Wonka's chocolate is the best!`;
      title = req.query.title || `Push notification received!`;
      imgName = req.query.imgName || `FM_logo_2013.png`;
	}

  clickTarget = req.query.clickTarget || `https://salespause-phone.au-syd.mybluemix.net/app/subscribe`;
  subscribers.forEach(pushSubscription => {
    const payload = JSON.stringify({ message : message, clickTarget: clickTarget, title: title, imgName: imgName });

    webPush.sendNotification(pushSubscription, payload, {}).then((response) =>{
      console.log("Status : "+util.inspect(response.statusCode));
      console.log("Headers : "+JSON.stringify(response.headers));
      console.log("Body : "+JSON.stringify(response.body));
    }).catch((error) =>{
      console.log("Status : "+util.inspect(error.statusCode));
      console.log("Headers : "+JSON.stringify(error.headers));
      console.log("Body : "+JSON.stringify(error.body));
    });
  });

  res.send('Notification sent!');
});

app.post('/subscribe', function (req, res) {
  let endpoint = req.body['notificationEndPoint'];
  let publicKey = req.body['publicKey'];
  let auth = req.body['auth'];
  let pushSubscription = {
    endpoint: endpoint,
    keys: {
      p256dh: publicKey,
      auth: auth
    }
  };

  subscribers.push(pushSubscription);
  res.send('Subscription accepted!');
});

app.post('/unsubscribe', function (req, res) {
  let endpoint = req.body['notificationEndPoint'];
  subscribers = subscribers.filter(subscriber => { endpoint == subscriber.endpoint });
  res.send('Subscription removed!');
});

io.on('connection', (socket) => {
  let socketId = socket.id;
  console.log(`user connected -> id: ${socketId}`);

  update();

  // This event probably creates the channel with the name
  // given as "chName" and join the channel.
  socket.on('pub:ch', (chName) => {
    ch[chName] = socketId;
    update();
    socket.join(chName);
    console.log(`Pub: ${socketId} create #${chName}`);
  });

  // Registers a subscriber
  socket.on('sub:connect', () => {
    sub[socketId] = 1;
    update();
  });

  // Joining to the channel of "chName"
  socket.on('sub:join', (chName) => {
    socket.join(chName);

    // Emit a notification of the socket joined
    socket.to(chName).emit("sub:joined", socketId);

    console.log(`Sub: ${socketId} join to #${chName}`);
  });

  socket.on('sub:leave', (chName) => {
    socket.leave(chName);

    // Emit a notification of the socket leaved
    socket.to(chName).emit("sub:left", socketId);

    console.log(`Sub: ${socketId} leave #${chName}`);
  });

  socket.on('audio', (data) => {
    socket.to(data.ch).emit('audio', data.buf);
  });

  socket.on('disconnect', () => {
    console.log(`user disconnected -> id: ${socketId}`);
    if (socketId in sub) {
      delete sub[socketId];
    } else {
      Object.keys(ch).forEach((chName) => {
        if (ch[chName] === socketId) {
          socket.to(chName).emit('delCh');
          delete ch[chName];
        }
      });
    }

    update();
  });

  // "ch" has a list of channels.
  // This method sends the ilist data to all clients.
  function update() {
    console.log(`Ch:`, ch);
    socket.emit('ch', ch);
    socket.broadcast.emit('ch', ch);
  }
});

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`listening on *:${port}`);
});
