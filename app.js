var express = require('express');
var app     = express();

var socket  = require('socket.io');
var io      = socket();

var ejs     = require('ejs');
var mongo   = require('mongodb');
var crypto  = require('crypto');
var multer  = require('multer');
var upload  = multer({dest: 'uploads' });
var granted = [ ];

// app.listen(2000);
io.listen(app.listen(80));

io.on("connection", client => {
	client.on("message", o => {
		if (o.action == 'text') {
			o.user = granted[o.session].name;
			io.send(o);
		} else if (o.action == 'join') {
			io.send({action:'text', user:'Server:', status:'connect',
				data: granted[o.session].name + " เข้ามาแล้ว"});
			client.user = granted[o.session].name;
		}
	});
	client.on("disconnect", () => {
		if (client.user) {
			var m = {action: 'text', user:'Server:', status:'disconnect',
				data: client.user + " ออกไปแล้ว"};
			io.send(m);
		}
	});
});

app.engine('html', ejs.renderFile);
app.use(session);
app.get('/', (req, res) => res.render('index.html') );
app.get('/register', function(req, res) {
	res.render('register.html');
});
app.post('/register', registerNewUser);
app.get('/login', (req, res) => res.render('login.html'));
app.post('/login', loginUser);
app.get('/profile', showProfile);
app.get('/logout', logoutUser);
app.get('/new', showNewPost);
app.get('/save', saveNewPost);
app.post('/save', upload.single('photo'), savePost);
app.get('/list', showAll);
app.get('/view/:id', showDetail);
app.get('/chat', showChat);

app.get('/total', calculate);
function calculate(req, res) {
	var result = req.query.price * 107 / 100;
	res.send({total: result});
}

app.get('/area/:r', area);
function area(req, res) {
	var result = Math.PI * req.params.r * req.params.r;
	res.send("The area is " + result);
}

app.get('/interest', interest);
function interest(req, res) {
	var result = req.query.balance * 1.25 / 100;
	res.send("The interest is " + result);
}

app.get('/fixed/:balance', fixed);
function fixed(req, res) {
	var result = req.params.balance * 1.25 / 100;
	res.send("The interes is " + result);
}

var coffee = [
	{name:'Latte', price:80},
	{name:'Mocha', price:90},
	{name:'Espresso', price:70}
]

app.get('/budget/:price', showCoffee);
function showCoffee(req, res) {
	// req.params.price
	var result = [ ];
	for (var i = 0; i < coffee.length; i++) {
		if (req.params.price >= coffee[i].price) {
			result.push(coffee[i]);
		}
	}
	res.send(result);
}

app.use( express.static('public') );
app.use( express.static('uploads') );
app.use( showError );

function session(req, res, next) {
	var cookie = req.headers["cookie"];
	if (cookie == null) {
		cookie = "";
	}
	var data = cookie.split(";");
	for (var i = 0; i < data.length; i++) {
		var field = data[i].split("=");
		if (field[0] == "session") {
			req.session = field[1];
		}
	}
	if (req.session == null) {
		req.session = parseInt(Math.random() * 1000000) +
				"-" + parseInt(Math.random() * 1000000) +
				"-" + parseInt(Math.random() * 1000000) +
				"-" + parseInt(Math.random() * 1000000);
		res.set("Set-Cookie", "session=" + req.session);
	}
	next();
}

function registerNewUser(req, res) {
	var data = "";
	req.on("data", chunk => data += chunk );
	req.on("end", () => {
		var u = { };
		data = data.replace(/\+/g, ' ');
		var a = data.split('&');
		for (var i = 0; i < a.length; i++) {
			var f = a[i].split('=');
			u[f[0]] = decodeURIComponent(f[1]);
		}
		u.password = crypto.createHmac('sha256', u.password).digest('hex');
		mongo.MongoClient.connect('mongodb://127.0.0.1/start',
			(error, db) => {
				db.collection('user').find({email: u.email}).toArray(
					(error, data) => {
						if (data.length == 0) {
							db.collection('user').insert(u);
							res.redirect("/login");
						} else {
							res.redirect("/register?message=Duplicated Email");
						}
					}
				);
			}
		);
	});
}

function loginUser(req, res) {
	var data = "";
	req.on("data", chunk => data += chunk );
	req.on("end", () => {
		var u = { };
		data = data.replace(/\+/g, ' ');
		var a = data.split('&');
		for (var i = 0; i < a.length; i++) {
			var f = a[i].split('=');
			u[f[0]] = decodeURIComponent(f[1]);
		}
		u.password = crypto.createHmac('sha256', u.password).digest('hex');
		mongo.MongoClient.connect("mongodb://127.0.0.1/start", (error, db) => {
			db.collection("user").find(u).toArray((error, data) => {
				if (data.length == 0) {
					res.redirect("/login?message=Password ผิด");
					// res.send(alert('Password ผิด'))
				} else {
					granted[req.session] = data[0];
					res.redirect("/chat");
				}
			});
		});
	});
}

function showProfile(req, res) {
	if (granted[req.session] == null) {
		res.redirect("/login");
	} else {
		var u = granted[req.session];
		var c = ["Latte", "Mocha", "Espress"];
		res.render("profile.html",
			{user: u, coffee: c });
	}
}

function logoutUser(req, res) {
	delete granted[req.session];
	res.render("logout.html");
}

function showError(req, res, next) {
	res.status(404).render('error.html');
}

function showNewPost(req, res) {
	if (granted[req.session] == null) {
		res.redirect('/login');
	} else {
		res.render('new.html');
	}
}

function savePost(req, res) {
	if (granted[req.session] == null) {
		res.redirect('/login');
	} else {
		var data = { };
		data.topic  = req.body.topic;
		data.detail = req.body.detail;
		data.owner  = granted[req.session]._id;
		data.time   = new Date();
		data.photo  = req.file.filename;
		mongo.MongoClient.connect('mongodb://127.0.0.1/start',
			(error, db) => db.collection('post').insert(data)
		);
		res.redirect('/list');
	}
}

function saveNewPost(req, res) {
	if (granted[req.session] == null) {
		res.redirect('/login');
	} else {
		var data = {};
		data.topic = req.query.topic;
		data.detail = req.query.detail;
		data.owner = granted[req.session]._id;
		data.time  = new Date();
		mongo.MongoClient.connect('mongodb://127.0.0.1/start',
			(error, db) => db.collection('post').insert(data)
		);
		res.redirect('/profile');
	}
}

function showAll(req, res) {
	mongo.MongoClient.connect('mongodb://127.0.0.1/start',
		(error, db) => {
			db.collection('post').find().toArray(
				(error, data) => {
					res.render('list.html', {post: data});
				}
			);
		}
	);
}

function showDetail(req, res) {
	mongo.MongoClient.connect('mongodb://127.0.0.1/start',
		(error, db) => {
			var query = { _id: mongo.ObjectId(req.params.id) }
			db.collection('post').find(query).toArray(
				(error, data) => {
					res.render('detail.html', {post: data[0]});
				}
			);
		}
	);
}

function showChat(req, res) {
	if (granted[req.session] == null) {
		res.redirect('/login');
	} else {
		res.render('chat.html',
			{ user: granted[req.session] } );
	}
}
