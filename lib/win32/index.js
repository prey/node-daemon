const exec = require('child_process').exec;
const { basename } = require('path');
const service  = require('./service');

const killProcess = (process_name, cb) => {
  exec('taskkill /f /im ' + process_name, cb);
}

const stopServiceProcess = (key, cb) => {
  service.bin_path(key, function(err, binPath) {
    if (err) return cb(err);

    const exe = basename(binPath);
    killProcess(exe, cb);
  })
}

const deleteService = (key, cb) => {
  return service.delete(key, cb);
}

exports.exists = function(key, cb) {
  service.exists(key, cb);
}

exports.test_create = function(opts, cb) {
  cb(new Error('Not supported, since Windows does not use init scripts.'));
}

exports.create = function(opts, cb) {
  if (opts.daemon_path === null || opts.daemon_path === false)
    service.create(opts, cb);
  else
  installService(opts, cb)
}

const installService = (opts, cb) =>{
  const key  = opts.key;
  const bin  = opts.bin;

  if (!key || !bin)
    return cb(new Error('Both key and bin are required.'))

  const serviceName = key;

  const fx = [
    (cb) => { 
      const cmd = `sc create ${serviceName} binPath= "${bin}"`;
      exec(cmd, cb);
    },
    (cb) => { 
      if (opts.args) {
        const cmd = `sc description ${serviceName} "${opts.args}"`;
        exec(cmd, cb);
      } else {
        cb();
      }
    },
    (cb) => { 
      if (opts.desc) {
        const cmd = `sc description ${serviceName} "${opts.desc}"`;
        exec(cmd, cb);
      } else {
        cb();
      }
    },
    (cb) => { 
      if (opts.path) {
        const cmd = `sc config ${serviceName} ObjectName="NT SERVICE\\TrustedInstaller"`;
        exec(cmd, function(err) {
          if (err) return cb(err);
          const cmd = `sc sdset ${serviceName} "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)"`;
          exec(cmd, cb);
        });
      } else {
        cb();
      }
    }
  ];

  async.series(fx, cb);
}

exports.ensure_created = function(opts, cb) {
  exports.ensure_destroyed(opts.key, function(err) {
    if (err) return cb(err);

    exports.create(opts, cb);
  })
}

exports.start = function(key, cb) {
  service.start(key, cb);
}

exports.stop = function(key, cb) {
  service.stop(key, cb);
}

// tries to stop. if unstoppable, kills the process
// if service doesn't exist, returns error
exports.ensure_stopped = function(key, cb) {
  exports.stop(key, function(err, stdout) {
    if (err && err.code != 1052) { // 1052 code means couldn't stop

      // only return error if error isn't 'NOT_RUNNING'
      return err.code == 'NOT_RUNNING' ? cb() : cb(err);
    }

    stopServiceProcess(key, cb);
  });
}

exports.destroy = function(key, cb) {
  this.exists(key, function(err, exists) {
    if (err || !exists) return cb(new Error('Service not found.'));

    exports.ensure_stopped(key, function(err) {
      deleteService(key, cb);
    })
  });
}

exports.ensure_destroyed = function(key, cb) {
  this.destroy(key, function(err) {
    if (err && !err.message.match(/not found/i))
      return cb(err);

    cb();
  })
}
