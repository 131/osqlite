"use strict";

const tmppath   = require('nyks/fs/tmppath');
const pipe      = require('nyks/stream/pipe');
const createWriteStream = require('nyks/fs/createWriteStream');
const promisify  = require('nyks/function/promisify');
const md5File    = promisify(require('nyks/fs/md5File'));
const cargo   = require('nyks/async/cargo');
const sleep   = require('nyks/async/sleep');
const Storage  = require('swift/storage');

const debug  = require('debug');


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
      log.debug("uploading", {_backup_path, file_md5});
      await Storage.putFile(this._sctx, _backup_path, this._container, this._filename, file_md5);
      log.debug("Sync done", {_backup_path, file_md5});
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

  async connect() {
    if(this._lnk)
      return this._lnk;

    let _tmp_path   = tmppath('sqlite');
    let _tmp_stream = await createWriteStream(_tmp_path);

    try {
      let src = await Storage.download(this._sctx, this._container, this._filename);
      await pipe(src, _tmp_stream);
    } catch(err) {
      log.debug("generating empty database as ", this._container, this._filename, "is empty");
    }

    Local.prototype.connect.call(this, _tmp_path);

    this.on("change", this.backup);
    return this._lnk;
  }

}

module.exports = Remote;

