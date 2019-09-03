"use strict";

const Local  = require('./local');
const Remote = require('./remote');

class OSQLite {
  static build({backend, filename, ...opts}) {

    if(backend.type == "local")
      return new Local(filename);

    if(backend.type == "swift")
      return new Remote({backend, filename, ...opts});

    throw `Invalid backend type`;
  }
}
module.exports = OSQLite;
module.exports.SQL = Local.SQL;

