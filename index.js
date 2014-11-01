'use strict';

var _ = require('lodash'),
    Q = require('bluebird'),
    git = require('nodegit'),
    tmp = require('tmp'),
    tar = require('tar-fs'),
    _request = require('request'),
    fs = require('fs'),
    child_process = require('child_process');

var _exec = child_process.exec;
var _open = git.Repo.open;

var exec = function(command, options) {
  command = command + ' 2>&1';

  var deferred = Q.defer();

  _exec(command, options, function(err, stdout) {
    if (err) return deferred.reject(err);
    return deferred.resolve();
  });

  return deferred.promise;
};

var createTemporaryName = function() {
  var deferred = Q.defer();

  tmp.tmpName({ template: '.tmp/XXXXXX' }, function(err, name) {
    if (err) return deferred.reject(err);
    return deferred.resolve(name);
  });

  return deferred.promise;
};

var open = function(source) {
  var deferred = Q.defer();

  _open(source, function(err, repo) {
    if (err) return deferred.reject(err);

    return deferred.resolve(repo);
  });

  return deferred.promise;
};

var clone = function(source, target) {
  var command = 'git clone ' + source + ' ' + target;

  return exec(command)
    .then(function() {
      return open(target);
    });
};

var tags = function(repo) {
  var deferred = Q.defer();

  repo.getReferences(1, function(err, refs) {
    if (err) return deferred.reject(err);

    var tags = _(refs).filter(function(ref) {
      return ref.match(/^refs\/tags\/(.+)$/)
    }).map(function(ref) {
      return ref.substring(10);
    }).value();

    return deferred.resolve(tags);
  });

  return deferred.promise;
};

// var index = function(repo) {
//   var deferred = Q.defer();

//   repo.getReference('refs/tags/' + tag, function(err, ref) {
//     if (err) return deferred.reject(err);

//     repo.getTag(ref.target().sha(), function(err, tag) {
//       if (err) return deferred.reject(err);

//       return deferred.resolve(tag);
//     })
//   });

//   return deferred.promise;
// };

// var tag = function(repo, tag) {
//   var deferred = Q.defer();

//   repo.getReference('refs/tags/' + tag, function(err, ref) {
//     if (err) return deferred.reject(err);

//     repo.getTag(ref.target().sha(), function(err, tag) {
//       if (err) return deferred.reject(err);

//       return deferred.resolve(tag);
//     })
//   });

//   return deferred.promise;
// };

var checkout = function(repo, tag) {
  var command = 'git checkout ' + tag;
  var options = {
    cwd: repo.workdir()
  };

  return exec(command, options)
    .then(function() {
      return repo;
    });
};

var pack = function(source) {
  return tar.pack(source, {
      ignore: function(name) {
        return name === source + '/.git'
      }
    });
};

var request = function(stream, options) {
  var deferred = Q.defer();

  stream.pipe(_request(options, function(err, res, body) {
    if (err) return deferred.reject(err);
    if (!res) return deferred.reject('response is null');
    if (res.statusCode !== 200) return deferred.reject('[CODE: ' + res.statusCode + '] ' + res.body);

    try {
      return deferred.resolve(body);
    } catch (e) {
      return deferred.reject(e);
    }
  }));

  return deferred.promise;
};

var request = function(server, tag) {
  var url = 'http://' + server + '/build?t=' + tag;

  return Q.try(function() {
    return _request.post(url);
  });
};


var source = '.tmp/temp';

//clone('https://github.com/kjunine/docker-sample', source)
open(source)
  .then(function(repo) {
    return checkout(repo, '0.0.2');
  })
  .then(function(repo) {
    return request('localhost:2375', 'test/test');
  })
  .then(function(req) {
    pack(source).pipe(req);
    req.pipe(process.stdout);
  })
  .catch(function(err) {
    console.log(err);
  });
