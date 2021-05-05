var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var bodyParser = require("body-parser");

// routers (html pages)
var loginRouter = require('./routes/login');
var groupRouter = require('./routes/group');
var userRouter = require('./routes/user');

// database file
var dbRouter = require('./db/dbRouter');
// database class instance
let d;

// create the app itself
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs'); // so we can use normal html

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/', loginRouter);
app.get('/group/:roomcode', groupRouter);
app.use('/user', userRouter);

app.get('/end', (req, res, next) => {
  if (d != undefined)
    d.destroy();
  res.send("Ended connection pool -- Goodbye");
})

app.post('/refresh-leaderboard/:roomcode', async (req,res,next) => {
  var result;
  try {
    result = await d.getLeaderBoard();
    console.log("leaderboard: ", result);
    res.json(result);
  } catch(error) {
    console.log("error in updateLeaderboard");
  }
})

function make_db_instance() {
  try {
    d.destroy();
  } catch(error) {
    console.log('database connection was never defined');
  }
  d = new dbRouter();
}
// create room
app.post('/submit-create', async (req,res,next) => {
  //console.log("Server: ", req.body.username);
  make_db_instance();
  var r = 0;
  var rc = "";
  try {
    r = await d.createRoom(req.body.username);
    rc = d.getRoom()[1];
    //console.log('Room code', rc);
  } catch(error) {
    console.log("error in create");
  }
  //console.log(r);
  res.json({
    status: r,
    roomcode: rc,
  })
})
// join room
app.post('/submit-join', async (req, res, next) => {
  make_db_instance();
  var r = 0;
  var rc = "";
  var user = "";
  try {
    rc = req.body.roomcode;
    user = req.body.username;
    r = await d.joinRoom(user, rc);
  } catch(error) {
    console.log("error in join");
  }
  res.json({
    status: r,
  })
});

app.post('/user-info', async (req, res, next) => {
  var data = ['0', '0', '0'];
  var ri;
  try {
    data = d.getUser();
    ri = d.getRoom();
  } catch(error) {
    console.log("error in user-info");
  }
  res.json({
    userid: data[0],
    roomcode: data[1],
    username: data[2],
    roomid: ri[0],
    isleader: ri[3]
  })
})

app.post('/refresh-results/:roomcode', async (req, res, next) => {
  console.log("refresh-results POST: ", req.body);
  var result;
  try {
    result = await d.refreshResults(req.body);
  } catch(error) {
    console.log("error in refresh-results");
  }
  console.log('refresh results: ', result);
  res.json(JSON.stringify(result));
})

app.post('/update-results/:roomcode', async (req, res, next) => {
  console.log(req.body.final_rankings);
  try {
    await d.updateResults(req.body.final_rankings);
  }catch(error) {
    console.log("error in update-results");
  }
  res.end();
})

app.post('/user-vote/:roomcode', async (req,res,next) => {
  try {
    console.log(req.body);
    await d.addMovieAndVote(req.body.movieTitle, req.body.vote);
  }
  catch(error) {
    console.log("error in user votes");
  }
  res.end();
})

app.post('/get-movies/:roomcode/:userid', async (req, res, next) => {
  let movie;
  try {
    movie = await d.getMoviesFromServices();
    console.log(movie);

  } catch(error) {
    console.log("error in getting movies");
  }
  res.json(movie);
})
app.post('/search-movies/:roomcode/:userid', async (req, res, next) => {
  let movieName;
  console.log(req.body);
  try {
    movieName = await d.searchMovieFromServices(req.body.name);
    console.log("movieName", movieName);
  } catch(error) {
    console.log("error in searching movies");
  }
  res.json(movieName);
})
app.post('/user-names/:roomcode', async (req, res, next) => {
  var data = [];
  var jsonObj = [];
  try {
    data = await d.selectUsers();
    //console.log(data);
    for (var i = 0; i < data.length; i++) {
      var item = {};
      item["username"] = data[i];
      jsonObj.push(item);
    }
  } catch(error) {
    console.log("error in user-names");
  }
  //console.log("user-names data");
  //console.log(jsonObj);
  res.json(jsonObj);
})

app.post('/update-services/:roomcode', async (req, res, next) => {
  var services = req.body.servicesStr;
  console.log('post update services: ', services);
  var r = 0;
  try {
    r = await d.updateServices(services);
  } catch(error) {
    console.log("error in update-services");
  }
  //console.log(r);
  res.json({
    services
  })
})

app.post('/refresh-services/:roomcode', async (req, res, next) => {
  var services = "000000";
  try {
    services = await d.refreshServices();
  } catch(error) {
    console.log("error in refresh-services");
  }
  console.log("refresh-services: ", services);
  res.json({
    services
  })
})

app.post('/start-tournament/:roomcode', async (req, res, next) => {
  let result;
  let jsonObj = [];
  try {
    result = await d.populateTournament();
    console.log(result);
    for (var i = 0; i < result.length; i++) {
      var item = {};
      item["moviename"] = result[i];
      jsonObj.push(item);
    }
  } catch(error) {
    console.log("error in start tournament");
  }
  res.json(jsonObj);
})

app.post('/close-room/:roomcode', async (req, res, next) => {
  try {
    await d.close_room();
    d.destroy();
  } catch(error) {
    console.log("erro in close-room");
  }
  res.send("Ended connection pool -- Goodbye");
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  console.log(err.message);
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  d.destroy();
  res.status(err.status || 500);
  res.render('error');
});

/*
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})
*/



module.exports = app;
