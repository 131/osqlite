"use strict";

const fs        = require('fs');

const tmppath   = require('nyks/fs/tmppath');
const pipe      = require('nyks/stream/pipe');
const createWriteStream = require('nyks/fs/createWriteStream');
const promisify  = require('nyks/function/promisify');
const md5File    = promisify(require('nyks/fs/md5File'));
const cargo      = require('nyks/async/cargo');
const sleep      = require('nyks/async/sleep');
const defer      = require('nyks/promise/defer');
const Storage    = require('swift/storage');

const debug      = require('debug');


const log = {
  debug : debug('osqlite:swift:debug'),
  info  : debug('osqlite:swift:info'),
  error : debug('osqlite:swift:error'),
};

const Local  = require('./local');

class Remote extends Local {

  constructor({backend, container, filename}) {
    super();

    if(backend.type != 'swift')
      throw `Unsupported backend (for now)`;
    this._sctx      = backend.ctx; //storage ctx
    this._container = container;
    this._filename  = filename;
    this.backup = cargo(this._backup.bind(this), Infinity).push;

    this._current_md5 = null;
    this._next_md5    = null;
    this._cancelLoop = this._updateLoop();
  }


  _updateLoop() {
    let cancelLoop = defer();
    cancelLoop.catch(() => {});

    (async () => {
      do {
        let remote_md5 = this._current_md5;
        try {
          let res = await Storage.head(this._sctx, this._container, this._filename);
          remote_md5 = res.headers.etag;
        } catch(err) { }

        if(this._current_md5 && [this._current_md5, this._next_md5].indexOf(remote_md5) == -1) {
          log.debug("Downloading because", remote_md5, "not in", [this._current_md5, this._next_md5]);
          await this._remoteUpdate();
        }

        try {
          await Promise.race([sleep(10 * 1000), cancelLoop]);
        } catch(err) {
          return err;
        }
      } while(true);
    })();
    return cancelLoop;
  }

  async _remoteUpdate() {
    await Local.prototype.close.call(this);
    await this.connect();
    this.emit("remote_update");
  }

  async _backup(tasks) {
    log.debug("Ticking for %d tasks", tasks.length);
    try {
      let _backup_path   = tmppath('backup');

      var backup = this._lnk.backup(_backup_path);
      await new Promise((resolve, reject) => {
        backup.step(-1, function(err) {
          if(err)
            return reject(err);
          backup.finish(function(err) {
            if(err)
              return reject(err);
            resolve(backup);
          });
        });
      });
      let file_md5 = await md5File(_backup_path);
      this._next_md5 = file_md5;
      log.debug("uploading", {_backup_path, file_md5});
      await Storage.putFile(this._sctx, _backup_path, this._container, this._filename, file_md5);
      log.debug("Sync done", {_backup_path, file_md5});
      this._current_md5 = file_md5;
    } catch(err) {
      console.log("Failure", err);
    }
    await sleep(2000); //wait at least 2s between ticks
  }

  async destroy() {
    log.debug("destroy remote database", this._container, this._filename);
    try {
      await Storage.deleteFile(this._sctx, this._container, this._filename);
    } catch(err) {
      log.debug("Failure in cleanup");
    }
  }


  async close() {
    if(this._lnk)
      this._lnk.removeAllListeners("change");

    await Local.prototype.close.call(this);

    if(this._cancelLoop)
      this._cancelLoop.reject();

    if(this._tmp_path) {
      fs.unlinkSync(this._tmp_path);
      this._tmp_path = null;
    }
  }

  async connect() {
    if(this._lnk)
      return this._lnk;

    this._tmp_path  = tmppath('sqlite');
    let _tmp_stream = await createWriteStream(this._tmp_path);

    try {
      let src = await Storage.download(this._sctx, this._container, this._filename);
      this._current_md5 = src.headers.etag;
      await pipe(src, _tmp_stream);
    } catch(err) {
      log.debug("generating empty database as ", this._container, this._filename, "is empty");
    }

    Local.prototype.connect.call(this, this._tmp_path);

    this._lnk.addListener("change", this.backup);
    return this._lnk;
  }

}

module.exports = Remote;

