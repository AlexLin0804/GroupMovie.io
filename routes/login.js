var express = require('express');
var router = express.Router();

/*
 * GET LOGIN PAGE
 */
router.get('/', function(req, res, next) {
  console.log('login');
  res.render('login.html');
});

// return it to the app
module.exports = router;