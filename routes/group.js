var express = require('express');
var router = express.Router();

/*
 * GET LOGIN PAGE
 */
router.get('/group/:roomcode', function(req, res, next) {
  //console.log('In router');
  res.render('group.html');
});

// return it to the app
module.exports = router;