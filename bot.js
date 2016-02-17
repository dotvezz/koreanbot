var irc = require('irc');
var mongo = require('mongodb').MongoClient,
  assert = require('assert');
var bot;

Array.prototype.contains = function(obj) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] === obj) {
      return true;
    }
  }
  return false;
};

var Bot = function(db, irc) {
  this.nicks = db.collection('nicks');
  this.hosts = db.collection('hosts');
  this.kicks = db.collection('kicks');
  this.irc = irc;
  this.hostUpdateTimeouts = {};
  this.operators = ['ghosty', 'scribblebees', 'Motivator', 'MotivatorAFK', 'Pikmeir', 'PikmeirAFK', 'Scribble', 'NewbieSone'];
};

Bot.prototype.checkNick = function(channel, nick, message) {
  bot.nicks.findOne({nick:nick}, function(error, result) {
    if (!result) {
      var channel = message.args[0];
      bot.nicks.insert({nick:nick});
      bot.irc.say(channel, nick+"님 안녕하세요! Welcome to "+channel+"!");
    }
  });
};

Bot.prototype.scheduleHostUpdate = function(nick, host) {
  bot.hostUpdateTimeouts[nick] = setTimeout(function() {
    bot.updateHosts(nick, host);
    delete bot.hostUpdateTimeouts[nick];
  }, 62000);
};

Bot.prototype.unscheduleHostUpdate = function(nick) {
  clearTimeout(bot.hostUpdateTimeouts[nick]);
  delete bot.hostUpdateTimeouts[nick];
};

Bot.prototype.updateHosts = function(nick, host) {
  bot.hosts.findOne({
    nick: nick,
    host: host
  }, function(error, result) {
    if (!result) {
      bot.hosts.insert({
        nick: nick,
        host: host
      });
    }
  });
};

Bot.prototype.logKick = function(nick, by, reason) {
  this.kicks.insert({nick:nick, by:by, reason:reason});
};

Bot.prototype.respondWithUserInfo = function(nick, requester) {
  var resultArray = [];
  bot.hosts.find({nick:nick}).toArray(function(err, documents) {
    var hostArray = [];
    for (var x = 0; x < documents.length; x++) {
      hostArray.push(documents[x].host);
    }
    bot.hosts.find({host:{$in:hostArray}}).toArray(function(err, documents) {
      for (var x = 0; x < documents.length; x++) {
        resultArray.push(documents[x].nick);
      }
      bot.irc.say(requester, 'Other nicks that may have been used by this user:');
      if (resultArray.length) {
        bot.irc.say(requester, resultArray.join(', '));
      } else {
        bot.irc.say(requester, 'NO RESULTS');
      }
      if (resultArray.length) {
        bot.kicks.count({nick:{$in:resultArray}}, function(error, result){
          bot.irc.say(requester, 'The above nicks have been kicked ' + result + ' times.');
        });
      }
    });
  });;
};


Bot.prototype.identify = function(message) {
  bot.irc.say('nickserv', "identify pass");
};

Bot.prototype.addListeners = function() {
  // The basic greeting stuff
  this.irc.addListener('join', this.checkNick); // If the nick isn't in the collection, greet and store.

  // Host tracking stuff
  this.irc.addListener('join', function(channel, nick, message) {
    bot.scheduleHostUpdate(message.nick, message.host);
    bot.updateHosts(message.nick, message.host);
  });

  this.irc.addListener('nick', function(oldnick, newnick, channels, message) {
    bot.unscheduleHostUpdate(oldnick);
    bot.updateHosts(newnick, message.host);
  });

  // Kick tracking stuff
  this.irc.addListener('kick', function(channel, nick, by, reason, message) {
    bot.logKick(nick, by, reason);
  });

  //Messaging stuff
  this.irc.addListener('message', function(requester, to, text, message) {
    if (to == 'hybot' && bot.operators.contains(requester)) {
      if (text.match(/(^info)\s+[a-z0-9]+$/ig)) {
        nick = text.match(/[a-z0-9]+$/ig)[0];
        bot.respondWithUserInfo(nick, requester)
      }
    }
  });

  //Identify
  this.irc.addListener('registered', this.identify);
  

  //Error Catcher
  this.irc.addListener('error', function(error){
    console.log(error);
  });
};

var main = function(error, db) {
  irc = new irc.Client('irc.snoonet.org', 'hybot', {
    channels: ['#korean', '#learnKorean'],
    userName: 'hybot',
    realName: 'HwanYeongBot'
  });
  bot = new Bot(db, irc);
  bot.addListeners();
};

mongo.connect("mongodb://username:pass@localhost:27017/collection", main);
// mongo.connect("mongodb://localhost:27017/koreanbot", main);

